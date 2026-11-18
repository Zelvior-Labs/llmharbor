package io.github.zelvior.ossllmapi.mobile;

import android.app.*;
import android.content.Intent;
import android.content.res.AssetManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

/** The only process that loads Node. node::Start and process.exit are process-wide. */
public final class GatewayService extends Service {
    static final String STOP = "io.github.zelvior.ossllmapi.mobile.STOP";
    private static final String CHANNEL = "gateway";
    private boolean launched;
    private static native int runNode(String entry, String home, String temp);

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!launched) {
            launched = true;
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Local gateway", NotificationManager.IMPORTANCE_LOW));
            int immutable = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), immutable);
            PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, GatewayService.class).setAction(STOP), immutable);
            startForeground(1, new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.router_icon)
                .setContentTitle("OSSLLMAPI").setContentText("Local gateway · tap for dashboard and status")
                .setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null, "Stop", stop).build()).build());
            new Thread(null, () -> {
                try {
                    File entry = installGateway();
                    System.loadLibrary("gateway");
                    runNode(entry.getAbsolutePath(), getFilesDir().getAbsolutePath(), getCacheDir().getAbsolutePath());
                } catch (Exception | LinkageError failure) {
                    // No exception bodies/arguments in public logs: neither codes nor keys belong there.
                    android.util.Log.e("OSSLLMAPI", "Cannot start packaged runtime: " + failure.getClass().getSimpleName());
                } finally {
                    stopSelf();
                }
            }, "ossllmapi-node", 4L * 1024 * 1024).start();
        }
        return START_NOT_STICKY; // Explicit start, no boot receiver or restart loop under memory pressure.
    }

    private File installGateway() throws Exception {
        File root = new File(getFilesDir(), "runtime");
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("runtime directory");
        long update = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        File dest = new File(root, String.valueOf(update));
        if (!dest.isDirectory()) {
            // Clean ONLY replaceable application assets, never the sibling data directory.
            File[] old = root.listFiles();
            if (old == null) throw new IOException("list runtime");
            for (File f : old) removeTree(f);
            File stage = new File(root, "staging");
            copyAssets("gateway", stage);
            Files.move(stage.toPath(), dest.toPath(), StandardCopyOption.ATOMIC_MOVE);
        }
        return new File(dest, "gateway.mjs");
    }
    private void copyAssets(String name, File dest) throws IOException {
        AssetManager assets = getAssets();
        String[] children = assets.list(name);
        if (children == null) throw new IOException("missing asset");
        if (children.length == 0) {
            try (InputStream input = assets.open(name)) { Files.copy(input, dest.toPath()); }
        } else {
            Files.createDirectory(dest.toPath());
            for (String child : children) copyAssets(name + "/" + child, new File(dest, child));
        }
    }
    private static void removeTree(File f) throws IOException {
        File[] children = f.listFiles();
        if (children != null) for (File child : children) removeTree(child);
        Files.delete(f.toPath());
    }
    @Override public void onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
        // Runs only in :gateway. Node's normal SIGTERM handler drains HTTP and closes SQLite.
        new Handler(Looper.getMainLooper()).postDelayed(() -> Process.killProcess(Process.myPid()), 10000);
        Process.sendSignal(Process.myPid(), 15);
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
