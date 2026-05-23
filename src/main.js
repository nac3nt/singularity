import 'babylonjs-loaders';
import './index.css';
import { SceneManager } from './core/SceneManager.js';

// --- Initialize Application ---
try {
    const sceneManager = new SceneManager();

    // Expose for debugging
    window.sceneManager = sceneManager;

} catch (error) {
    console.error('Failed to initialize application:', error);

    // Show user-friendly error message
    const canvas = document.getElementById('renderCanvas');
    if (canvas) {
        canvas.style.display = 'none';
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
      <div style="text-align: center; padding: 50px; color: #ff6b6b;">
        <h2>Failed to Load Gravitational Lensing Visualization</h2>
        <p>Please check the console for more details.</p>
        <p>Make sure your browser supports WebGL and the HDR texture file is available.</p>
      </div>
    `;
        canvas.parentNode.insertBefore(errorDiv, canvas);
    }
}
