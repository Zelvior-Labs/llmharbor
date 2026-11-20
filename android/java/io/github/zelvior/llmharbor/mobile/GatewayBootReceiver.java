package io.github.zelvior.llmharbor.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Opt-in start after a reboot; off by default so the app never surprises its owner. */
public final class GatewayBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        if (!Prefs.get(context, Prefs.BOOT)) return;
        try {
            Gateway.start(context);
        } catch (RuntimeException refused) {
            android.util.Log.w("LLMHarbor", "Boot start refused: " + refused.getClass().getSimpleName());
        }
        Widgets.refresh(context);
        GatewayTileService.requestRefresh(context);
    }
}
