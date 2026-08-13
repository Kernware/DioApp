JAVA_HOME = $(shell /usr/libexec/java_home -v 17)
ANDROID_HOME ?= $(HOME)/Library/Android/sdk
APK = android/app/build/outputs/apk/release/app-release.apk
DOCKER_APK = dist/app-release.apk

IOS_CONFIGURATION ?= Release
APP = ios/build/Build/Products/$(IOS_CONFIGURATION)-iphoneos/DIOPayments.app

.PHONY: build_apk docker_build_apk build_ios install_ios xcode prebuild prebuild_android prebuild_ios clean_android clean_ios

# Regenerating the native projects deletes the build state Gradle and Xcode rely on,
# so only prebuild when a project is missing. Run `make prebuild` explicitly after
# changing app.config.js.
android/gradlew:
	npx expo prebuild --platform android

ios/DIOPayments.xcworkspace:
	npx expo prebuild --platform ios

# EXPO_PUBLIC_* values are inlined into the bundle at build time, so .env must be
# filled in before building.
build_apk: android/gradlew
	@test -f .env || echo "warning: no .env found, the APK will be built with empty Stripe and bank values"
	cd android && JAVA_HOME="$(JAVA_HOME)" ANDROID_HOME="$(ANDROID_HOME)" ./gradlew assembleRelease
	@echo "APK: $(APK)"

# Builds the APK inside Docker instead — no local Android Studio/SDK/NDK needed.
# .env is passed as a build secret so it's usable during the JS bundle step
# without ever being written into an image layer.
docker_build_apk:
	@test -f .env || echo "warning: no .env found, the APK will be built with empty Stripe and bank values"
	docker build -f Dockerfile.android \
		$$(test -f .env && echo --secret id=env_file,src=.env) \
		--output type=local,dest=./dist .
	@echo "APK: $(DOCKER_APK)"

build_ios: ios/DIOPayments.xcworkspace
	@test -f .env || echo "warning: no .env found, the app will be built with empty Stripe and bank values"
	xcodebuild -workspace ios/DIOPayments.xcworkspace -scheme DIOPayments \
		-configuration $(IOS_CONFIGURATION) -destination "generic/platform=iOS" \
		-derivedDataPath ios/build -allowProvisioningUpdates
	@echo "APP: $(APP)"

# Installs onto the single connected iPhone. Pass IOS_DEVICE=<identifier> to pick one
# when several are attached; `xcrun devicectl list devices` shows them.
install_ios: build_ios
	@device="$(IOS_DEVICE)"; \
	if [ -z "$$device" ]; then \
		device=$$(xcrun devicectl list devices | awk '$$4 == "connected" { print $$3; exit }'); \
	fi; \
	if [ -z "$$device" ]; then \
		echo "no connected iPhone found: unlock it, trust this Mac, or pass IOS_DEVICE=<identifier>"; \
		exit 1; \
	fi; \
	set -x; xcrun devicectl device install app --device "$$device" "$(APP)"

xcode: ios/DIOPayments.xcworkspace
	open ios/DIOPayments.xcworkspace

prebuild: prebuild_android prebuild_ios

prebuild_android: clean_android android/gradlew

prebuild_ios: clean_ios ios/DIOPayments.xcworkspace

clean_android:
	rm -rf android

clean_ios:
	rm -rf ios
