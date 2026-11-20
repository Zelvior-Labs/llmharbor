package io.github.zelvior.llmharbor.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/** Reports a failed self-update; success replaces this process, so there is nothing to say. */
public final class InstallReceiver extends BroadcastReceiver {
    static final String ACTION_STATUS = "io.github.zelvior.llmharbor.mobile.INSTALL_STATUS";

    @Override public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION || status == PackageInstaller.STATUS_SUCCESS) return;
        String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        String text = "Update was not installed. " + (message == null ? "" : message);
        Toast.makeText(context, text.trim(), Toast.LENGTH_LONG).show();
    }
}
