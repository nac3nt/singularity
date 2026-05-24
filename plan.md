# Major Expansion Plans: Singularity Simulation

This document outlines potential major feature expansions for the **Singularity** relativistic black hole simulation. We will select one of these features to implement in the next phase.

---

## 1. Interactive Wormhole Metrics (Morris-Thorne Portal)
* **Description:** Integrate a second metric (like the Morris-Thorne wormhole) that allows the camera to fly through the singularity into an entirely different universe (a new skybox).
* **Technical Challenges:**
  - Transition the raymarching geodesic equations from Schwarzschild/Kerr spacetime to a wormhole coordinate system.
  - Render a lensed sphere showing the "other side" before crossing the throat.
  - Seamlessly swap the environment map and post-processing variables upon crossing.
* **Value:** Provides a mind-bending, cinematic transition effect similar to the wormhole sequence in *Interstellar*.

## 2. Binary Black Hole Merger & Spacetime Ripples (Gravitational Waves)
* **Description:** Add a preset or mode showing two orbiting black holes in their inspiral phase merging into one.
* **Technical Challenges:**
  - Update the raymarching engine to calculate light bending around two separate gravitational wells simultaneously (multi-body geodesic integration).
  - Add a post-processing filter that ripples spacetime coordinates based on the gravitational wave quadrupole formula.
  - Handle accretion disk collisions and accretion flow transitions.
* **Value:** The accretion disks collide dynamically, and the gravitational lensing double-images the background stars in real time, creating beautiful, undulating optical patterns.

## 3. Pilot Mode with Relativistic Aberration (Lorentz Warp)
* **Description:** A manual flight mode where you pilot a spacecraft near the black hole at relativistic speeds ($0.1c$ to $0.99c$).
* **Technical Challenges:**
  - Implement relativistic aberration of light: as the ship speeds up, the background sky contracts forward into a headlight beam (the searchlight effect).
  - Calculate extreme Doppler shifts (blue-shifting everything in front, red-shifting everything behind).
  - Integrate orbit controls with flight mechanics, including orbital decay and frame-dragging forces.
* **Value:** Gamifies the simulation, giving users an active, high-fidelity experience of what traveling near light speed actually looks and feels like.

## 4. GPU Fluid Dynamics for Accretion Turbulences
* **Description:** Replace the current procedural noise disk with a real-time, GPU-accelerated fluid simulation (using Navier-Stokes or smoothed-particle hydrodynamics).
* **Technical Challenges:**
  - Render a 2D/3D velocity map to a render target texture that feeds the raymarching density check.
  - Implement interaction hooks to allow users to click/drag on the disk to introduce turbulent shocks, flares, or magnetic loops.
* **Value:** The accretion disk becomes alive and interactive, reacting to user inputs with physically plausible plasma hydrodynamics.

## 5. Polarized Light & Magnetic Field Lines (EHT Mode)
* **Description:** A scientific overlay visualizing the polarization of light emitted by the accretion disk, similar to the Event Horizon Telescope's polarimetric images.
* **Technical Challenges:**
  - Apply equations for synchrotron emission and Faraday rotation.
  - Draw vector field overlays or glowing streamlines showing the direction and strength of the magnetic field lines wrapping around the singularity.
* **Value:** Shifts the app from a pure visualizer into a cutting-edge educational tool, appealing heavily to physics enthusiasts and classrooms.
