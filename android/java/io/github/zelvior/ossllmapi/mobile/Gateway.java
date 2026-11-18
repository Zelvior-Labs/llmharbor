package io.github.zelvior.ossllmapi.mobile;

import android.content.Context;
import android.content.Intent;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/** Shared gateway state, read only from our private filesystem socket. */
final class Gateway {
    /** Notification / tile intent action that opens the browser dashboard. */
    static final String ACTION_OPEN = "io.github.zelvior.ossllmapi.mobile.OPEN_DASHBOARD";

    private Gateway() {}

    static JSONObject state(Context context) {
        // Do NOT treat a response on localhost as proof this is our server:
        // only our UID can reach this filesystem socket, and no code or token
        // is ever sent in a URL or intent.
        File socket = new File(context.getFilesDir(), "control.sock");
        try (LocalSocket client = new LocalSocket()) {
            client.connect(new LocalSocketAddress(socket.getPath(), LocalSocketAddress.Namespace.FILESYSTEM));
            client.setSoTimeout(1500);
            String line = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8)).readLine();
            if (line == null) return null;
            JSONObject state = new JSONObject(line);
            int port = state.optInt("port");
            return port > 1024 && port < 65536 ? state : null;
        } catch (Exception offline) {
            return null;
        }
    }

    static boolean running(Context context) { return state(context) != null; }

    static void start(Context context) {
        context.startForegroundService(new Intent(context, GatewayService.class));
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, GatewayService.class));
    }
}
