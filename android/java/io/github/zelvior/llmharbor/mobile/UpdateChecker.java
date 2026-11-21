package io.github.zelvior.llmharbor.mobile;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Self-update from the project's GitHub releases. An APK is only offered
 * when Android could actually install it: same package name and the same
 * signing certificate as the running app. Version-locked previews therefore
 * report "install the newer build manually" instead of downloading a file that
 * would fail at install time.
 */
final class UpdateChecker {
    interface Callback { void result(boolean ok, String message, Candidate candidate); }

    static final class Candidate {
        final String version, apkUrl, sumsUrl, assetName;
        Candidate(String version, String apkUrl, String sumsUrl, String assetName) {
            this.version = version; this.apkUrl = apkUrl; this.sumsUrl = sumsUrl; this.assetName = assetName;
        }
    }

    private static final String RELEASES = "https://api.github.com/repos/zelvior/llmharbor/releases?per_page=10";
    private static final Handler UI = new Handler(Looper.getMainLooper());

    private UpdateChecker() {}

    static void check(Context context, Callback callback) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                Candidate candidate = find(app);
                final String message = candidate == null
                    ? "You are on the newest build that this install can take."
                    : "Version " + candidate.version + " is available.";
                UI.post(() -> callback.result(true, message, candidate));
            } catch (Exception error) {
                final String message = describe(error);
                UI.post(() -> callback.result(false, message, null));
            }
        }, "llmharbor-update-check").start();
    }

    static void downloadAndInstall(Context context, Candidate candidate, Callback callback) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try {
                if (!app.getPackageManager().canRequestPackageInstalls()) {
                    Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + app.getPackageName()));
                    allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    app.startActivity(allow);
                    throw new IOException("Allow LLMHarbor to install unknown apps, then tap Check for updates again.");
                }
                if (app.getPackageName().matches(".*\\.p\\d+$")) {
                    // Version-locked previews carry a per-build ID, so no download could
                    // ever install over this one: say so before spending the user's data.
                    throw new IOException("This preview is signed with a one-time key, so Android cannot update it in place. "
                        + "Download the newest APK from the releases page and install it beside this one.");
                }
                String sums = new String(fetchBytes(candidate.sumsUrl, 256 * 1024), StandardCharsets.UTF_8);
                String expected = null;
                for (String line : sums.split("\n")) {
                    String[] parts = line.trim().split("\\s+");
                    if (parts.length == 2 && parts[1].equals(candidate.assetName)) expected = parts[0].toLowerCase();
                }
                if (expected == null) throw new IOException("This release has no checksum for " + candidate.assetName);
                File apk = new File(app.getCacheDir(), "update-" + candidate.version + ".apk");
                byte[] bytes = fetchBytes(candidate.apkUrl, 160 * 1024 * 1024);
                if (!expected.equals(sha256(bytes))) throw new IOException("The downloaded APK failed its checksum.");
                try (OutputStream out = new FileOutputStream(apk)) { out.write(bytes); }
                verifyInstallable(app, apk);
                commit(app, apk);
                UI.post(() -> callback.result(true, "Confirm the Android install prompt to finish updating.", null));
            } catch (Exception error) {
                final String message = describe(error);
                UI.post(() -> callback.result(false, message, null));
            }
        }, "llmharbor-update-download").start();
    }

    private static Candidate find(Context context) throws Exception {
        JSONArray releases = new JSONArray(new String(fetchBytes(RELEASES, 2 * 1024 * 1024), StandardCharsets.UTF_8));
        long installed = installedCode(context);
        List<String> abis = Arrays.asList(Build.SUPPORTED_ABIS);
        Candidate best = null;
        long bestCode = installed;
        for (int i = 0; i < releases.length(); i++) {
            JSONObject release = releases.getJSONObject(i);
            if (release.optBoolean("draft")) continue;
            String tag = release.optString("tag_name");
            // Older previews were tagged android-v<version>; the unified
            // release workflow publishes every platform under v<x.y.z>.
            String version;
            if (tag.startsWith("android-v")) version = tag.substring("android-v".length());
            else if (tag.matches("^v\\d+\\.\\d+\\.\\d+$")) version = tag.substring(1);
            else continue;
            long code = versionCode(version);
            if (code <= bestCode) continue;
            JSONArray assets = release.optJSONArray("assets");
            if (assets == null) continue;
            String sums = null;
            for (int j = 0; j < assets.length(); j++) {
                JSONObject asset = assets.getJSONObject(j);
                if ("SHA256SUMS.txt".equals(asset.optString("name"))) sums = asset.optString("browser_download_url");
            }
            if (sums == null) continue;
            Candidate found = null;
            for (String abi : abis) {
                String suffix = "-android-" + abi + ".apk";
                for (int j = 0; j < assets.length() && found == null; j++) {
                    JSONObject asset = assets.getJSONObject(j);
                    String name = asset.optString("name");
                    if (name.endsWith(suffix)) {
                        found = new Candidate(version, asset.optString("browser_download_url"), sums, name);
                    }
                }
                if (found != null) break;
            }
            if (found != null) {
                best = found;
                bestCode = code;
            }
        }
        return best;
    }

    /** Mirrors the packager's versionCode scheme so releases compare without a manifest download. */
    static long versionCode(String version) {
        java.util.regex.Matcher match = java.util.regex.Pattern
            .compile("^(\\d+)\\.(\\d+)\\.(\\d+)(?:-preview\\.(\\d+))?$").matcher(version);
        if (!match.matches()) return 0;
        long major = Long.parseLong(match.group(1)), minor = Long.parseLong(match.group(2));
        long patch = Long.parseLong(match.group(3));
        long preview = match.group(4) == null ? 0 : Long.parseLong(match.group(4));
        return ((major * 100 + minor) * 1000 + patch) * 100 + preview;
    }

    private static void verifyInstallable(Context context, File apk) throws Exception {
        PackageManager manager = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null) throw new IOException("The download is not a readable APK.");
        if (!context.getPackageName().equals(archive.packageName)) {
            throw new IOException("That release is for " + archive.packageName + ", not this install.");
        }
        PackageInfo installed = manager.getPackageInfo(context.getPackageName(), flags);
        if (versionCodeOf(archive) <= versionCodeOf(installed)) {
            throw new IOException("The download is not newer than this install.");
        }
        if (!fingerprint(archive).equals(fingerprint(installed))) {
            throw new IOException("This preview was signed with a one-time key, so Android cannot update it in place. "
                + "Download the newest APK from the releases page and install it beside this one.");
        }
    }

    @SuppressWarnings("deprecation")
    private static String fingerprint(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
            ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners())
            : info.signatures;
        if (signatures == null || signatures.length == 0) return "";
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        List<String> values = new ArrayList<>();
        for (Signature signature : signatures) values.add(hex(digest.digest(signature.toByteArray())));
        java.util.Collections.sort(values);
        return values.toString();
    }

    private static void commit(Context context, File apk) throws Exception {
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        int id = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(id);
        try {
            try (OutputStream out = session.openWrite("base.apk", 0, apk.length());
                 InputStream in = new FileInputStream(apk)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
                session.fsync(out);
            }
            int mutability = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
            PendingIntent status = PendingIntent.getBroadcast(context, id,
                new Intent(context, InstallReceiver.class).setAction(InstallReceiver.ACTION_STATUS),
                PendingIntent.FLAG_UPDATE_CURRENT | mutability);
            session.commit(status.getIntentSender());
        } finally {
            session.close();
        }
    }

    @SuppressWarnings("deprecation")
    static long installedCode(Context context) throws Exception {
        PackageManager manager = context.getPackageManager();
        PackageInfo info = manager.getPackageInfo(context.getPackageName(), 0);
        return versionCodeOf(info);
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    private static byte[] fetchBytes(String url, int limit) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(45000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "LLMHarbor-Android");
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        try {
            int status = connection.getResponseCode();
            if (status == 403 || status == 429) {
                String remaining = connection.getHeaderField("X-RateLimit-Remaining");
                if ("0".equals(remaining)) {
                    throw new IOException("GitHub's unauthenticated rate limit is used up. "
                        + "Try again later, or install the newest APK from the releases page.");
                }
                throw new IOException("GitHub refused the request (HTTP " + status + ").");
            }
            if (status != 200) throw new IOException("GitHub answered HTTP " + status + ".");
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = in.read(buffer)) > 0) {
                    out.write(buffer, 0, read);
                    if (out.size() > limit) throw new IOException("The download is larger than expected.");
                }
                return out.toByteArray();
            }
        } finally {
            connection.disconnect();
        }
    }

    private static String sha256(byte[] bytes) throws Exception {
        return hex(MessageDigest.getInstance("SHA-256").digest(bytes));
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) out.append(String.format("%02x", value));
        return out.toString();
    }

    private static String describe(Exception error) {
        String message = error.getMessage();
        if (message == null || message.isEmpty()) return "Update check failed: " + error.getClass().getSimpleName();
        return message;
    }
}
