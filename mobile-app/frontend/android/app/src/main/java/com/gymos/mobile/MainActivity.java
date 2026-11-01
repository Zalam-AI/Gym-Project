package com.gymos.mobile;

import android.graphics.Color;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GymOSRestFeedbackPlugin.class);
        super.onCreate(savedInstanceState);

        // Enforce SOFT_INPUT_ADJUST_RESIZE so Android never pans/translates the whole window
        // upward when an <input> inside the WebView is focused, while letting Capacitor 8's
        // built-in SystemBars listener on decorView handle systemBars + cutout + IME padding once.
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#121417"));
    }
}
