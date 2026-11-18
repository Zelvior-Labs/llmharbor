package io.github.zelvior.ossllmapi.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/** Home-screen start/stop control. State is always re-read from the private socket. */
public final class GatewayWidget extends AppWidgetProvider {
    static final String ACTION_TOGGLE = "io.github.zelvior.ossllmapi.mobile.WIDGET_TOGGLE";

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                Widgets.refresh(context);
            } finally {
                pending.finish();
            }
        }, "ossllmapi-widget").start();
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_TOGGLE.equals(intent.getAction())) return;
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                if (Gateway.running(context)) Gateway.stop(context); else Gateway.start(context);
                Thread.sleep(600);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            } catch (RuntimeException ignored) {
                // Android 12+ can refuse a background foreground-service start.
            } finally {
                Widgets.refresh(context);
                GatewayTileService.requestRefresh(context);
                pending.finish();
            }
        }, "ossllmapi-widget-toggle").start();
    }

    static ComponentName component(Context context) { return new ComponentName(context, GatewayWidget.class); }
}

/** Keeps the launcher widgets, the Quick Settings tile and the notification in one state. */
final class Widgets {
    private Widgets() {}

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(GatewayWidget.component(context));
        if (ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    static RemoteViews build(Context context) {
        boolean running = Gateway.running(context);
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.gateway_widget);
        views.setTextViewText(R.id.widget_status,
            context.getString(running ? R.string.widget_running : R.string.widget_stopped));
        views.setTextViewText(R.id.widget_toggle,
            context.getString(running ? R.string.stop_gateway : R.string.start_gateway));
        views.setOnClickPendingIntent(R.id.widget_toggle, PendingIntent.getBroadcast(context, 0,
            new Intent(context, GatewayWidget.class).setAction(GatewayWidget.ACTION_TOGGLE), flags));
        views.setOnClickPendingIntent(R.id.widget_status, PendingIntent.getActivity(context, 0,
            new Intent(context, MainActivity.class), flags));
        return views;
    }
}
