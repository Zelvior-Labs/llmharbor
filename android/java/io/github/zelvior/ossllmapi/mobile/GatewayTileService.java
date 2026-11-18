package io.github.zelvior.ossllmapi.mobile;

import android.content.ComponentName;
import android.content.Context;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** Quick Settings tile: one tap starts or stops the gateway. */
public final class GatewayTileService extends TileService {
    static void requestRefresh(Context context) {
        try {
            requestListeningState(context, new ComponentName(context, GatewayTileService.class));
        } catch (RuntimeException ignored) {
            // Tile is not available on every launcher.
        }
    }

    @Override public void onStartListening() {
        super.onStartListening();
        new Thread(this::apply, "ossllmapi-tile").start();
    }

    @Override public void onClick() {
        super.onClick();
        new Thread(() -> {
            try {
                if (Gateway.running(this)) Gateway.stop(this); else Gateway.start(this);
                Thread.sleep(700);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            } catch (RuntimeException ignored) {
                // Refused background start; the launcher shows the real state.
            }
            apply();
            Widgets.refresh(this);
        }, "ossllmapi-tile-toggle").start();
    }

    private void apply() {
        Tile tile = getQsTile();
        if (tile == null) return;
        boolean running = Gateway.running(this);
        tile.setState(running ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        tile.setLabel(getString(running ? R.string.tile_running : R.string.tile_stopped));
        tile.updateTile();
    }
}
