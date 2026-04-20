# Deploying Aviator Club to Hostinger

This application is a **Full-Stack Node.js app**. To run it on Hostinger, you have two main options:

## Option 1: Hostinger VPS (Recommended)
This is the best way to run this "24/7 Game Loop" application.

1.  **Server Setup**: Choose "Ubuntu 22.04" or similar on your Hostinger VPS.
2.  **Install Node.js**:
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```
3.  **Upload Files**: Upload all files (except `node_modules` and `dist`) to your server.
4.  **Install & Build**:
    ```bash
    npm install
    npm run build
    ```
5.  **Run with PM2** (Keep it running 24/7):
    ```bash
    sudo npm install -g pm2
    pm2 start server.ts --interpreter tsx
    pm2 save
    pm2 startup
    ```
6.  **Configure Nginx**: Point your domain to the port `3000`.

## Option 2: Hostinger Shared Hosting (CPanel)
Shared hosting is primarily for PHP. Running Node.js apps requires specific "Node.js Selector" support.

1.  Log in to **hPanel** (Hostinger Control Panel).
2.  Search for **Node.js** in the dashboard.
3.  Upload your files.
4.  Set the **Application root** to your folder.
5.  Set **Application startup file** to `server.ts`.
6.  Click **Run NPM Install** if available.
7.  **Warning**: Shared hosting might kill long-running background loops (like our game timer). For a smooth game experience, a **VPS** is strongly advised.

## Moving away from Firebase
Currently, the app uses Firebase for Auth and Real-time data. To "disconnect from Firebase" in the future:
1.  We would need to replace `AuthContext.tsx` with a custom Node.js login system.
2.  We would need to replace Firestore with a **MySQL** database (which Hostinger CPanel provides).
3.  We would need to add **Socket.io** to `server.ts` for real-time multiplier updates.

*Need help with these steps? Let me know!*
