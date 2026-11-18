package io.github.zelvior.ossllmapi.mobile;

import android.content.Context;

/** The handful of user choices that must survive restarts without the database. */
final class Prefs {
    static final String LAN = "lan";
    static final String BOOT = "boot";
    static final String KEEP = "keep";
    static final String ECO = "eco";

    private Prefs() {}

    static boolean get(Context context, String key) {
        return context.getSharedPreferences("settings", Context.MODE_PRIVATE).getBoolean(key, false);
    }

    static void set(Context context, String key, boolean value) {
        context.getSharedPreferences("settings", Context.MODE_PRIVATE).edit().putBoolean(key, value).apply();
    }
}
