// Declare the API exposed by preload.ts
interface ElectronAPI {
  onShowImage: (callback: (imagePath: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const focusImage = document.getElementById('focusImage') as HTMLImageElement;

if (focusImage) {
    window.electronAPI.onShowImage((imagePath: string) => {
        console.log('Renderer received image path:', imagePath);
        // Use file:// protocol prefix for local files
        focusImage.src = `file://${imagePath}`;
    });
} else {
    console.error("Could not find 'focusImage' element.");
}

// Add this line to ensure the file is treated as a module
export {};