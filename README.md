# airdrift
A fast-paced drone flight game set in a procedural city. Fly through dynamically spawned gates aligned with your movement, build combos, and score points with speed and precision. Arcade physics, cinematic camera, responsive HUD, and endless street-canyon courses reward skillful, fluid flying.

The project is built as a technical prototype focusing on systems design, performance, and gameplay feel rather than polished content.

# Core Features

Procedural City Streaming
	•	Chunk-based city and terrain generation
	•	Roads with realistic junctions, markings, sidewalks, curbs, and crossings
	•	Buildings, vehicles, vegetation, props, and street lighting
	•	Seamless streaming based on drone position

Drone Flight System
	•	Physics-driven drone using Rapier
	•	Altitude-locked arcade control model
	•	Yaw-based steering with smooth camera follow
	•	Speed-based field-of-view scaling for motion feedback

Gate-Based Gameplay
	•	Dynamic gate spawning ahead of the drone based on direction of travel
	•	Gates reposition continuously to form an endless course
	•	No repetitive straight-line gate placement
	•	Gates align to flight direction and urban layout

Scoring & Combo System
	•	Base score for passing gates
	•	Centering bonus for precision flying
	•	Speed bonus for aggressive flight
	•	Combo multiplier that builds with clean runs
	•	Combo decay over time without scoring
	•	Penalties applied on collisions

HUD System
	•	Real-time speed, altitude, orientation
	•	Score with smooth animated increments
	•	Combo multiplier and gate progress display
	•	Aviation-inspired mono-style presentation

# Technical Stack
	•	Three.js for rendering
	•	Rapier (WebAssembly) for physics
	•	TypeScript architecture
	•	Instanced meshes for performance
	•	Fixed-timestep physics loop
	•	Event-based collision handling

# Project Status
This project is currently paused after reaching a stable prototype stage.
The foundation for city generation, drone control, and gameplay scoring is complete.

Future expansion ideas include:
	•	Time trials and challenge modes
	•	Collision-based damage systems
	•	AI traffic and moving obstacles
	•	Replay and ghost systems
	•	Performance optimization for cloud deployment


# Purpose
This project serves as:
	•	A gameplay systems experiment
	•	A procedural environment prototype
	•	A technical exploration of real-time simulation in the browser
	•	A foundation for a potential full game or simulation product


# Disclaimer

This is an experimental prototype intended for learning, iteration, and exploration.
Assets are procedural and minimal by design.

