# Setup

1. Install app dependencies:
   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env`, or use the included POC `.env`.
3. For real backend invoice/payment-link flows, configure `server/.env` and start the server:
   ```sh
   cd server
   npm install
   npm start
   ```

4. Build the native development app:
   ```sh
   npx expo prebuild
   npx expo run:ios
   # or: npx expo run:android
   ```

# Build

```
make build_apk
make build_ios
```
