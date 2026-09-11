import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The signing key lives outside the repo (see .gitignore). Without it Gradle still builds a
// debug APK; a release build needs it, because an APK signed with a different key cannot
// update one already installed in a café.
val signingProps = Properties().apply {
    val f = rootProject.file("keystore/signing.properties")
    if (f.exists()) FileInputStream(f).use { load(it) }
}

android {
    namespace = "om.serva.station"
    compileSdk = 35

    signingConfigs {
        if (signingProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    defaultConfig {
        applicationId = "om.serva.station"
        // 26 is where foreground services and background limits settle; older tablets than
        // that are not worth the printing edge cases.
        minSdk = 26
        targetSdk = 35
        versionCode = 7
        versionName = "1.6"
    }
    buildTypes {
        release {
            // Left off deliberately: the app is ~40KB of our own code, so shrinking buys
            // nothing measurable and costs a class of crash that only shows up in a café.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (signingProps.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { viewBinding = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
