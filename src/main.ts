import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as remoteMain from '@electron/remote/main';

// Initialize @electron/remote
remoteMain.initialize();

let overlayWindow: BrowserWindow | null = null;
let imagePaths: string[] = [];
let currentImageIndex = 0;
const SHORTCUT = 'Alt+Space'; // Define the shortcut

// Timer for checking if keys are still held
let keyCheckInterval: NodeJS.Timeout | null = null;
let isOverlayVisible = false;

function loadImagePaths() {
    // __dirname points to the 'dist' folder where main.js runs from
    // We need to go up one level ('..') and then into 'images'
    const imagesDir = path.resolve(__dirname, '..', 'images');
    console.log(`Looking for images in: ${imagesDir}`);
    imagePaths = []; // Reset list
    currentImageIndex = 0; // Reset index

    if (fs.existsSync(imagesDir)) {
        try {
            const files = fs.readdirSync(imagesDir);
            const supportedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
            imagePaths = files
                .filter(file => supportedExtensions.includes(path.extname(file).toLowerCase()))
                .map(file => path.join(imagesDir, file)); // Store absolute paths
            console.log(`Found images: ${imagePaths.length > 0 ? imagePaths.join(', ') : 'None'}`);
        } catch (err) {
            console.error('Error reading images directory:', err);
        }
    } else {
        console.warn(`Images directory not found: ${imagesDir}`);
        // Create the directory if it doesn't exist
        try {
            fs.mkdirSync(imagesDir, { recursive: true }); 
            console.log(`Created images directory: ${imagesDir}`);
        } catch (mkdirErr) {
            console.error('Error creating images directory:', mkdirErr);
        }
    }
}

function createOverlayWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    overlayWindow = new BrowserWindow({
        width: width,
        height: height,
        x: primaryDisplay.workArea.x,
        y: primaryDisplay.workArea.y,
        transparent: true, // Allows for transparency
        frame: false, // No window frame (borders, close button, etc.)
        alwaysOnTop: true, // Keep the window on top of others
        skipTaskbar: true, // Don't show in the taskbar
        show: false, // Start hidden
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Use compiled preload
            nodeIntegration: false, // Disable Node.js integration in renderer for security
            contextIsolation: true, // Isolate renderer context from main process
            devTools: !app.isPackaged // Enable DevTools only in development
        },
    });

    // Enable @electron/remote for this window
    remoteMain.enable(overlayWindow.webContents);

    // Make sure loadFile path is correct relative to __dirname (dist)
    overlayWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });

    // Make window non-focusable to prevent stealing focus
    overlayWindow.setFocusable(false);
}

function showOverlay() {
    if (!overlayWindow || imagePaths.length === 0) return;
    
    const imageToShow = imagePaths[currentImageIndex];
    console.log(`Showing image index ${currentImageIndex}: ${imageToShow}`);
    overlayWindow.webContents.send('show-image', imageToShow);
    overlayWindow.show();
    isOverlayVisible = true;
}

function hideOverlay() {
    if (!overlayWindow) return;
    
    console.log('Hiding overlay.');
    overlayWindow.hide();
    isOverlayVisible = false;
    
    // Advance to next image after hiding
    currentImageIndex = (currentImageIndex + 1) % (imagePaths.length || 1);
    console.log(`Next image index will be: ${currentImageIndex}`);
}

// Check if Alt+Space is still being held down by periodically checking globalShortcut
function startKeyCheckTimer() {
    // Clear existing timer if any
    if (keyCheckInterval) {
        clearInterval(keyCheckInterval);
        keyCheckInterval = null;
    }

    // Start a new timer that checks if shortcut is still registered
    keyCheckInterval = setInterval(() => {
        // Test if the shortcut is released by trying to register a temporary handler
        let keyReleased = false;
        
        try {
            // If this succeeds without error, it means the shortcut is not currently pressed
            globalShortcut.register(SHORTCUT, () => {});
            keyReleased = true;
            // Clean up the temporary registration
            globalShortcut.unregister(SHORTCUT);
        } catch (e) {
            // If we get here, the shortcut is still being held down
            keyReleased = false;
        }

        if (keyReleased && isOverlayVisible) {
            // If keys were released and overlay is visible, hide it
            hideOverlay();
            clearInterval(keyCheckInterval!);
            keyCheckInterval = null;
            
            // Restore the main shortcut handler
            registerMainShortcut();
        } else if (keyReleased) {
            // Just cleanup if overlay isn't visible
            clearInterval(keyCheckInterval!);
            keyCheckInterval = null;
            // Make sure main shortcut is registered
            registerMainShortcut();
        }
    }, 100); // Check every 100ms
}

// Register the main shortcut handler
function registerMainShortcut() {
    // Unregister first to avoid duplicates
    try {
        globalShortcut.unregister(SHORTCUT);
    } catch (e) {
        console.warn(`Error unregistering shortcut: ${e}`);
    }
    
    // Register the shortcut
    const registered = globalShortcut.register(SHORTCUT, () => {
        console.log(`${SHORTCUT} pressed`);
        
        // When shortcut is pressed, show overlay and start checking for release
        showOverlay();
        startKeyCheckTimer();
    });
    
    if (registered) {
        console.log(`${SHORTCUT} registered successfully.`);
    } else {
        console.error(`Failed to register ${SHORTCUT}.`);
    }
}

app.whenReady().then(() => {
    loadImagePaths(); // Load images on startup
    createOverlayWindow();
    registerMainShortcut();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            loadImagePaths(); // Reload images if app was inactive
            createOverlayWindow();
        }
    });
});

app.on('will-quit', () => {
    // Unregister all shortcuts
    globalShortcut.unregisterAll();
    
    // Clear any timers
    if (keyCheckInterval) {
        clearInterval(keyCheckInterval);
        keyCheckInterval = null;
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});