plugins {
    id("com.android.application")
}

android {
    namespace = "com.scorebox.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.scorebox.app"
        minSdk = 21
        targetSdk = 29
        // CI passes -PappVersionCode=<run number> so every published build has a
        // strictly higher versionCode than the last, which is what lets Android
        // install it as an update over an existing ScoreBox instead of refusing
        // it as a downgrade/conflict. Local builds fall back to 1.
        versionCode = (project.findProperty("appVersionCode") as String?)?.toIntOrNull() ?: 1
        versionName = "3.0"
    }

    signingConfigs {
        create("release") {
            // Checked into the repo on purpose, not a secret: ScoreBox is sideloaded
            // only (no Play Store listing, no permissions beyond INTERNET), so the
            // only thing this signature buys is a stable identity across CI builds --
            // installing a newer APK updates the app in place instead of requiring an
            // uninstall first. Regenerate keystore/scorebox-release.jks (and these
            // passwords) if that threat model ever changes.
            storeFile = rootProject.file("keystore/scorebox-release.jks")
            storePassword = "scorebox-sideload"
            keyAlias = "scorebox"
            keyPassword = "scorebox-sideload"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}
