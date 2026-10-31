package com.gymos.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GymOSRestFeedbackPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
