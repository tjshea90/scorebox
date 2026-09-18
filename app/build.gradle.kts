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
        versionCode = 1
        versionName = "3.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}
