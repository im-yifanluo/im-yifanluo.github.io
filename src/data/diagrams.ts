// The diagram definitions for the project pages, one per diagram, named by id from a project's figures
// (`- diagram: <id>`). Their types, the lookup and the list-layout model are in src/lib/diagrams.ts.
import type { BarTable, DiagramSpec, FlowDiagram } from '@/lib/diagrams';

// Robot learning: from the demonstrations to the arm, and back through the logs.
const umi: FlowDiagram = {
  kind: 'flow',
  id: 'umi',
  width: 'wide',
  cols: 5,
  rows: 'auto 12px minmax(96px, auto) 44px minmax(80px, auto)',
  label: 'How the robot-learning pipeline fits together, step by step',
  caption: {
    text: "How the pieces fit: my handheld demonstrations and the lab's teleop datasets train diffusion policies, which run on the UR5e through my ROS 2 node; the robot's logs drove the fixes.",
  },
  heads: [
    { text: 'Data', at: { col: 1, row: 1 } },
    { text: 'Geometry', at: { col: 2, row: 1, colSpan: 2 } },
    { text: 'Learning', at: { col: 4, row: 1 } },
    { text: 'Robot', at: { col: 5, row: 1 } },
  ],
  nodes: [
    {
      id: 'demos',
      at: { col: 1, row: 3 },
      label: 'Handheld demonstrations',
      sub: 'GoPro fisheye + IMU',
      detail:
        'I recorded 487 clips in 5 sessions on my own UMI rig: a handheld gripper with a fisheye GoPro, its IMU and side mirrors.',
    },
    {
      id: 'slam',
      at: { col: 2, row: 3 },
      label: 'SLAM + tag mapping',
      sub: 'ORB-SLAM3 + IMU, ArUco',
      detail:
        "UMI's monocular-inertial ORB-SLAM3 tracks the camera; ArUco tags on the fingers give the gripper width, and a board on the table fixes the world frame.",
    },
    {
      id: 'traj',
      at: { col: 3, row: 3 },
      label: 'Metric 6-DoF trajectories',
      sub: 'in the table frame',
      keep: ['6-DoF'],
      detail:
        'Each demo becomes an end-effector path in meters. My SLAM QA tool checks every session: all 197 cylinder grasps tracked start to finish; 338 training episodes in all.',
    },
    {
      id: 'lab',
      side: true,
      at: { col: 1, row: 5 },
      label: 'Lab teleop datasets',
      sub: 'Allen key · knob turning',
      detail:
        "The lab's teleop datasets for Allen-key grasping (50 episodes) and knob turning (65 episodes). I trained policies on both and ran them on the UR5e.",
    },
    {
      id: 'conv',
      side: true,
      at: { col: 2, row: 5 },
      label: 'HDF5 → zarr converter',
      sub: 'with validation',
      keep: ['HDF5 → zarr'],
      detail:
        "My converter brings them into UMI's training format: quaternion → axis-angle, gripper scaling, JPEG-XL streaming and a natural-sort fix, each checked.",
    },
    {
      id: 'policy',
      at: { col: 4, row: 3 },
      label: 'Diffusion policy',
      sub: 'CLIP ViT-B/16 + U-Net',
      keep: ['CLIP ViT-B/16', 'U-Net'],
      detail:
        'A CLIP ViT-B/16 encoder and a ConditionalUnet1D denoise 16-step action chunks: ≈180 GPU-hours on one RTX 5080, after I ported the stack to Blackwell.',
    },
    {
      id: 'deploy',
      at: { col: 5, row: 3 },
      label: 'UR5e deployment',
      sub: 'my ROS 2 node, 10 → 60 Hz',
      keep: ['10 → 60 Hz'],
      detail:
        "My ROS 2 node turns 10 Hz plans into a 60 Hz command stream (linear position, SLERP rotation). Policies I trained on the lab's teleop datasets grasped an Allen key and turned a knob.",
    },
    {
      id: 'debug',
      at: { col: 5, row: 5 },
      label: 'Log-driven debugging',
      sub: 'step mode, replays',
      detail:
        "Every input and plan is logged. From the logs I fixed the gripper scale, the action spacing and the jerk at plan hand-offs, and measured the arm's 0.13–0.15 s lag.",
    },
  ],
  edges: [
    { from: 'demos', to: 'slam', route: 'h' },
    { from: 'slam', to: 'traj', route: 'h' },
    { from: 'traj', to: 'policy', route: 'h' },
    { from: 'policy', to: 'deploy', route: 'h' },
    { from: 'lab', to: 'conv', route: 'h' },
    { from: 'conv', to: 'policy', route: 'hv', toAt: 0.3 },
    { from: 'deploy', to: 'debug', route: 'v', fromAt: 0.35, label: 'logs', labelSide: 'left' },
    { from: 'debug', to: 'deploy', route: 'v', fromAt: 0.65, label: 'fixes', labelSide: 'right' },
    // replays: live-logged inputs re-run through the policy offline (offline evaluation)
    { from: 'debug', to: 'policy', route: 'hv', toAt: 0.7, label: 'replays', labelSide: 'right' },
  ],
};

// Framelight: the guidance loop on the phone. The model's edge is dashed: it scored the MVP and beta; live scoring
// moved to heuristics.
const framelight: FlowDiagram = {
  kind: 'flow',
  id: 'fl',
  width: 'wide',
  cols: 5,
  rows: '40px minmax(96px, auto) 44px minmax(80px, auto)', // room for the loop label's 20 px channel
  label: 'How the Framelight guidance loop works, step by step',
  caption: {
    text: 'How the coaching works, all on the phone: it finds the subject, scores a handful of framings around it and turns the best into one steady prompt, every 150 ms.',
  },
  nodes: [
    {
      id: 'preview',
      at: { col: 1, row: 2 },
      label: 'Live preview',
      sub: 'a snapshot every 150 ms',
      keep: ['150 ms'],
      detail:
        'The app takes a preview snapshot every 150 ms (every 500 ms once "Perfect" is locked) and decodes it once with OpenCV for every stage after it.',
    },
    {
      id: 'lock',
      side: true,
      at: { col: 2, row: 4 },
      label: 'Subject lock',
      sub: 'camera-thread tracker',
      detail:
        'Drag or tap a subject, and a frame-processor tracker follows it on the camera thread at up to 40 fps, re-acquiring it if it is lost.',
    },
    {
      id: 'subject',
      at: { col: 2, row: 2 },
      label: 'Find the subject',
      sub: 'edges, or a face',
      detail:
        'Edge density on a small copy of the frame locates the subject; an ML Kit face takes over when there is one, and selfie mode frames every face.',
    },
    {
      id: 'cands',
      at: { col: 3, row: 2 },
      label: 'Candidate framings',
      sub: '7–8 crops around the subject',
      detail:
        'Thirds, center, tight, wide, golden-ratio and gaze-room crops anchored on the subject, in place of a ~990-crop sliding window.',
    },
    {
      id: 'model',
      side: true,
      at: { col: 4, row: 4 },
      label: 'Composition model',
      sub: 'MobileNetV2 · TFLite · int8',
      detail:
        'I trained it on AVA, then CADB, and shipped it at 2.5 MB; it orders photo pairs as human raters do 76.8% of the time. It ranks photos, not crops, so in June 2026 we moved live guidance to heuristic scoring.',
    },
    {
      id: 'score',
      at: { col: 4, row: 2 },
      label: 'Score each framing',
      sub: 'composition features',
      detail:
        'Heuristic composition features rank the crops; our MVP fused them with the model as 0.7 × ML + 0.3 × heuristic.',
    },
    {
      id: 'prompt',
      at: { col: 5, row: 2 },
      label: 'One steady prompt',
      sub: 'SmartSuggester',
      detail:
        'A 12-sample score history, a 2% noise floor and 400 ms of hysteresis turn the best crop into one of 8 directions or "Zoom in" until "Perfect!" latches; auto-zoom steps in after the pan.',
    },
    {
      id: 'looks',
      at: { col: 5, row: 4 },
      label: 'Film looks',
      sub: 'after the shot',
      detail:
        'The app ranks 60 looks, curated from ~296 LUTs, for each photo and suggests up to 10; one SkSL shader grades the preview, thumbnails and export alike.',
    },
  ],
  edges: [
    { from: 'preview', to: 'subject', route: 'h' },
    { from: 'subject', to: 'cands', route: 'h' },
    { from: 'cands', to: 'score', route: 'h' },
    { from: 'score', to: 'prompt', route: 'h' },
    {
      from: 'prompt',
      to: 'preview',
      route: 'over',
      channel: 20,
      label: 'you move the phone; every 150 ms the loop reads the next frame',
      relText: 'Back to: Live preview, every 150 ms',
    },
    { from: 'lock', to: 'subject', route: 'v' },
    { from: 'model', to: 'score', route: 'v', dashed: true },
    { from: 'prompt', to: 'looks', route: 'v', label: 'the shot', labelSide: 'right' },
  ],
};

// memos: ship the scene, sync the state.
// The "Made once" lane is top-aligned (its boxes span the pipeline's first two rows), so its label sits on it.
const memos: FlowDiagram = {
  kind: 'flow',
  id: 'memos',
  width: 'wide',
  cols: 5,
  rows: 'auto 10px auto minmax(56px, auto) minmax(56px, auto) minmax(56px, auto) 56px auto 10px minmax(120px, auto)', // the scene label clears the frame and the lane label
  label: 'How memos is built once and relived together, step by step',
  caption: {
    text: 'Ship the scene, sync the state: a GPU builds each memory once, every device renders it itself, and only the clock, takes, grabs and poses travel live.',
  },
  heads: [
    { text: 'Made once', at: { col: 1, row: 1, colSpan: 2 }, list: true, before: 'glasses' },
    { text: 'Relived together, on any device', at: { col: 1, row: 8, colSpan: 3 }, list: true, before: 'viewer' },
  ],
  groups: [{ id: 'pipe', at: { col: 3, row: 3, colSpan: 2, rowSpan: 4 } }],
  nodes: [
    {
      id: 'glasses',
      at: { col: 1, row: 3, rowSpan: 2 },
      label: 'Ray-Ban Meta',
      sub: 'records the moment',
      detail:
        'The glasses record a short clip with sound. We recorded nine at the event, from 7 to 60 seconds, indoors and out.',
    },
    {
      id: 'app',
      at: { col: 2, row: 3, rowSpan: 2 },
      label: 'Phone app',
      sub: 'uploads each clip',
      detail:
        'An iPhone app on the Meta Wearables Device Access Toolkit pulls the clip off the glasses and uploads it through a resumable queue.',
    },
    {
      id: 'pipe',
      header: true,
      group: 'pipe',
      at: { col: 3, row: 3, colSpan: 2 },
      label: 'Vision pipeline',
      sub: 'a GPU worker on Runpod',
      detail:
        'I built this pipeline. A GPU worker on Runpod runs it on each upload and publishes the scene when the memory is ready.',
    },
    {
      id: 'vipe',
      step: true,
      group: 'pipe',
      at: { col: 3, row: 4, colSpan: 2 },
      label: 'Camera and depth',
      sub: 'NVIDIA ViPE',
      detail:
        'NVIDIA ViPE recovers the camera path, the lens, metric depth for every pixel, and masks of the people and objects.',
    },
    {
      id: 'world',
      step: true,
      group: 'pipe',
      at: { col: 3, row: 5, colSpan: 2 },
      label: 'Level, metric world',
      sub: 'floor at zero',
      detail: 'The whole clip is placed in one level world frame at real scale, with the floor at zero.',
    },
    {
      id: 'room',
      step: true,
      group: 'pipe',
      at: { col: 3, row: 6, colSpan: 2 },
      label: 'Room, people, props',
      sub: 'gsplat · ghosts · physics',
      detail:
        'A gsplat room trained with depth supervision, people as moving point ghosts, and small props carved out as grabbable splats with colliders.',
    },
    {
      id: 'scene',
      at: { col: 5, row: 3, rowSpan: 2 },
      label: 'Scene files',
      sub: '`memory.json` + splats',
      detail:
        '`memory.json` carries the room splat, the props, the people, the camera path and the audio. Each device downloads it once.',
    },
    {
      id: 'viewer',
      at: { col: 1, row: 10, colSpan: 3 },
      label: 'One web viewer',
      sub: 'three.js · Spark · Rapier',
      chips: ['Quest 3S', 'Phone', 'Desktop'],
      detail:
        "The same web app runs on a Quest 3S, phones and desktops. I built its follow and guided modes, the wearer's view and VR grabbing that freezes time.",
    },
    {
      id: 'stdb',
      at: { col: 4, row: 10, colSpan: 2 },
      label: 'SpacetimeDB',
      sub: 'the live, shared state',
      detail:
        "One shared clock, the takes, who holds what and every player's pose. Pause, throw something, and the edit becomes a new take; the recording stays as it was.",
    },
  ],
  edges: [
    { from: 'glasses', to: 'app', route: 'h' },
    { from: 'app', to: '#pipe', route: 'h' },
    { from: '#pipe', to: 'scene', route: 'h' },
    {
      from: 'scene',
      to: 'viewer',
      route: 'gap',
      fromAt: 0.5,
      toAt: 0.62,
      channel: 22,
      label: 'every device downloads the scene once',
    },
    { from: 'viewer', to: 'stdb', route: 'h', both: true },
  ],
};

// World Cup forecasting: anchored on the market, run by an agent. "First bot" /
// "Second bot" are spelled out. Player props take no edge from the odds (they follow the lineup).
const worldcup: FlowDiagram = {
  kind: 'flow',
  id: 'wc',
  width: 'wide',
  cols: 5,
  // equal model rows (1fr), and the single boxes sit in the middle one, so every box in that row has one height and each
  // fan has one port per side (centred boxes would shrink to their content)
  rows: 'minmax(64px, 1fr) 12px minmax(64px, 1fr) 12px minmax(64px, 1fr)',
  label: 'How the World Cup forecasting system works, step by step',
  caption: {
    text: "The engine anchors every answer on the market's odds and models only what the market does not price; a Claude Code agent ran both entries under my rules.",
  },
  groups: [{ id: 'agent', at: { col: 5, row: 1, rowSpan: 5 } }],
  nodes: [
    {
      id: 'odds',
      at: { col: 1, row: 3 },
      label: 'Betting odds',
      sub: 'DraftKings (via ESPN), Polymarket',
      detail:
        'Every answer starts from the market: bookmaker and Polymarket prices for each match. The engine never rates teams itself.',
    },
    {
      id: 'fair',
      at: { col: 2, row: 3 },
      label: 'Fair probabilities',
      sub: 'margin removed',
      detail: "The odds are de-margined, so the bookmaker's built-in margin does not leak into the forecasts.",
    },
    {
      id: 'grid',
      set: 'models',
      at: { col: 3, row: 1 },
      label: 'Scoreline grid',
      sub: 'Dixon–Coles',
      detail:
        'One Dixon–Coles grid of scoreline probabilities, fitted to those odds, answers every goal question, so no two answers contradict each other.',
    },
    {
      id: 'count',
      set: 'models',
      at: { col: 3, row: 3 },
      label: 'Count models',
      sub: 'negative binomial',
      detail:
        'Corners, cards, shots and fouls come from negative-binomial models on odds-implied scoring rates from ~41k club matches.',
    },
    {
      id: 'props',
      set: 'models',
      at: { col: 3, row: 5 },
      label: 'Player props',
      sub: 'from the confirmed lineup',
      detail: 'Expected minutes come from the confirmed starting XI, pulled automatically before kickoff.',
    },
    {
      id: 'families',
      at: { col: 4, row: 3 },
      label: '65 question families',
      sub: 'every question mapped',
      detail:
        'Each yes/no question maps to one of 65 families; 19 new ones were built and tested during the knockouts, each on the day it appeared.',
    },
    {
      id: 'agent',
      header: true,
      group: 'agent',
      at: { col: 5, row: 1 },
      label: 'Claude Code agent',
      sub: 'ran both bots for 38 days',
      detail:
        'Under my rules it scheduled passes 50 minutes before kickoffs, researched lineups and verified every submission; every number came from the pipeline.',
    },
    {
      id: 'bot1',
      group: 'agent',
      at: { col: 5, row: 3 },
      label: 'First bot · stable',
      sub: '#17 of 4,013 overall',
      keep: ['#17 of 4,013'],
      detail:
        "The stable configuration. Live, its forecasts averaged 42.2% where 42.2% happened; the crowd's averaged 47.1%.",
    },
    {
      id: 'bot2',
      group: 'agent',
      at: { col: 5, row: 5 },
      label: 'Second bot · A/B bench',
      sub: '#5 in the knockout stage',
      keep: ['A/B bench'],
      detail:
        'It tried one change at a time against the first; five constants reached the first bot, each only after winning its own settled markets.',
    },
  ],
  edges: [
    { from: 'odds', to: 'fair', route: 'h' },
    { from: 'fair', to: 'grid', route: 'elbow' },
    { from: 'fair', to: 'count', route: 'h' },
    { from: 'grid', to: 'families', route: 'elbow' },
    { from: 'count', to: 'families', route: 'h' },
    { from: 'props', to: 'families', route: 'elbow' },
    { from: 'families', to: 'bot1', route: 'elbow' },
    { from: 'families', to: 'bot2', route: 'elbow' },
  ],
};

// AR benchmark overlay: from a printed tag to a see-through guide.
const ar: FlowDiagram = {
  kind: 'flow',
  id: 'ar',
  width: 'wide',
  cols: 4,
  rows: 'auto 44px auto',
  label: 'How the AR benchmark overlay works, step by step',
  caption: {
    text: "From a printed tag to a see-through guide: the tag gives the camera's pose, and a camera matched to the RealSense intrinsics renders the layout over live video.",
  },
  nodes: [
    {
      id: 'frame',
      at: { col: 1, row: 1 },
      label: 'RealSense frame',
      sub: 'color + intrinsics K',
      detail:
        'Color frames come straight from the camera through pyrealsense2 (I moved capture off ROS topics), with the intrinsics K.',
    },
    {
      id: 'pose',
      at: { col: 2, row: 1 },
      label: 'Tag → camera pose',
      sub: 'AprilTag tag36h11',
      detail: "pupil-apriltags finds the printed tag on the table, and the tag gives the camera's pose relative to it.",
    },
    {
      id: 'frustum',
      side: true,
      at: { col: 2, row: 3 },
      label: 'Matching camera',
      sub: 'off-axis frustum from K',
      detail:
        'An off-axis OpenGL frustum built from K, with the OpenCV-to-OpenGL frame conversion, keeps the render aligned when the principal point is off-center.',
    },
    {
      id: 'scene',
      side: true,
      at: { col: 4, row: 3 },
      label: 'Benchmark scene',
      sub: 'ManipulationNet or YAML',
      detail:
        'Placements come from ManipulationNet scenes or my hand-editable YAML; my converter splits multi-material meshes into per-material URDFs for PyBullet.',
    },
    {
      id: 'render',
      at: { col: 3, row: 1 },
      label: 'Render the layout',
      sub: 'PyBullet',
      detail: "PyBullet renders the benchmark objects from the tag's pose through the matching camera.",
    },
    {
      id: 'blend',
      at: { col: 4, row: 1 },
      label: 'Blend over live video',
      sub: 'a see-through guide',
      detail:
        'The render is blended over the live frame at 0.6 alpha, so whoever sets up the scene sees where each real object goes.',
    },
  ],
  edges: [
    { from: 'frame', to: 'pose', route: 'h' },
    { from: 'pose', to: 'render', route: 'h' },
    { from: 'render', to: 'blend', route: 'h' },
    {
      from: 'frame',
      to: 'frustum',
      route: 'vh',
      fromAt: 0.5,
      label: 'K',
      labelSide: 'right',
      relText: 'Also into: Matching camera (intrinsics K)',
    },
    { from: 'frustum', to: 'render', route: 'hv', toAt: 0.3 },
    { from: 'scene', to: 'render', route: 'hv', toAt: 0.7 },
  ],
};

// Long-document RAG: same chunks, different order.
const rag: FlowDiagram = {
  kind: 'flow',
  id: 'rag',
  width: 'wide',
  cols: 5,
  rows: 'auto 10px minmax(64px, 1fr) 12px minmax(64px, 1fr) 12px minmax(64px, 1fr)', // equal order rows: one port per fan
  label: 'How the ordering study is controlled, step by step',
  caption: {
    text: 'The controlled study: every arm reads the same chunks, under the same budget and reader; only their order changes.',
  },
  heads: [{ text: 'one order per arm', at: { col: 3, row: 1 } }],
  nodes: [
    {
      id: 'docs',
      center: true,
      at: { col: 1, row: 3, rowSpan: 5 },
      label: 'Long documents',
      sub: 'five SCROLLS tasks',
      detail: 'QuALITY, ContractNLI, Qasper, QMSum and NarrativeQA, with the official SCROLLS loading and scoring.',
    },
    {
      id: 'chunks',
      center: true,
      at: { col: 2, row: 3, rowSpan: 5 },
      label: 'Retrieved chunks',
      sub: 'one set per question',
      detail:
        'The retriever picks one set of chunks under the token budget; a selected-set signature proves that every arm reads exactly the same chunks.',
    },
    {
      id: 'rel',
      set: 'orders',
      at: { col: 3, row: 3 },
      label: 'Relevance order',
      sub: 'best match first',
      detail: 'The usual RAG prompt: the most relevant chunk first.',
    },
    {
      id: 'docord',
      set: 'orders',
      at: { col: 3, row: 5 },
      label: 'Document order',
      sub: 'as in the source',
      detail: 'The same chunks, in the order they appear in the document.',
    },
    {
      id: 'anchor',
      set: 'orders',
      at: { col: 3, row: 7 },
      label: 'Anchor first',
      sub: 'then document order',
      detail:
        'The best match first, then the rest in document order: 39.56 against 36.72 for relevance order, on the 5-task average at 10K tokens.',
    },
    {
      id: 'reader',
      center: true,
      at: { col: 4, row: 3, rowSpan: 5 },
      label: 'Same reader',
      sub: 'Qwen2.5, official scoring',
      detail:
        'One Qwen2.5 reader and the official SCROLLS scorer for every arm, at the same budget, so only the order differs.',
    },
    {
      id: 'result',
      center: true,
      at: { col: 5, row: 3, rowSpan: 5 },
      label: 'Accuracy moves',
      sub: 'depends on the task',
      detail:
        'On 7,804 examples per arm, document order raised QuALITY by 5.13 points and cut ContractNLI by 3.95, at 5K tokens.',
    },
  ],
  edges: [
    { from: 'docs', to: 'chunks', route: 'h' },
    { from: 'chunks', to: 'rel', route: 'elbow' },
    { from: 'chunks', to: 'docord', route: 'h' },
    { from: 'chunks', to: 'anchor', route: 'elbow' },
    { from: 'rel', to: 'reader', route: 'elbow' },
    { from: 'docord', to: 'reader', route: 'h' },
    { from: 'anchor', to: 'reader', route: 'elbow' },
    { from: 'reader', to: 'result', route: 'h' },
  ],
};

// PhotoGleam: two round trips. The Gemini model versions are named in the page copy, not here.
const photogleam: FlowDiagram = {
  kind: 'flow',
  id: 'photogleam',
  width: 'wide',
  cols: 4,
  rows: 'minmax(88px, auto) 44px minmax(88px, auto)',
  label: 'How PhotoGleam turns a photo into named filters, step by step',
  caption: {
    text: 'Two round trips: the server asks Gemini for named filters, the app shows them, and Pillow applies the one you pick.',
  },
  nodes: [
    {
      id: 'app',
      at: { col: 1, row: 1 },
      label: 'Flutter app',
      sub: 'camera or upload',
      detail: 'The iOS and Android app takes a photo or an upload and sends it to the server.',
    },
    {
      id: 'filters',
      at: { col: 1, row: 3 },
      label: '`/get_filters`',
      sub: 'Flask on AWS EC2',
      detail: 'The first route sends the photo to Gemini and deletes the upload after the request.',
    },
    {
      id: 'gemini',
      at: { col: 2, row: 3 },
      label: 'Gemini',
      sub: 'named filters, with reasons',
      detail:
        'Gemini looks at the photo and returns a set of named filters, each a factor for brightness, contrast, color and sharpness, plus a one-line reason.',
    },
    {
      id: 'carousel',
      at: { col: 2, row: 1 },
      label: 'Filter carousel',
      sub: 'swipe, read the reason',
      detail: 'The app shows the returned filters as a swipeable carousel, each with its name and reason.',
    },
    {
      id: 'image',
      at: { col: 3, row: 3 },
      label: '`/get_image`',
      sub: 'Pillow ImageEnhance',
      detail:
        "The second route takes the photo and the chosen filter, applies it with Pillow's ImageEnhance and returns a JPEG.",
    },
    {
      id: 'saved',
      at: { col: 4, row: 1 },
      label: 'Saved',
      sub: 'to the phone and the gallery',
      detail: "The filtered photo is saved to the phone and to the app's gallery.",
    },
  ],
  edges: [
    { from: 'app', to: 'filters', route: 'v', label: 'photo', labelSide: 'right' },
    { from: 'filters', to: 'gemini', route: 'h' },
    { from: 'gemini', to: 'carousel', route: 'v', label: 'filters', labelSide: 'right' },
    // into the target's centre, like every other edge; flow.ts sets the label in the row gap
    { from: 'carousel', to: 'image', route: 'hv', label: 'your pick' },
    { from: 'image', to: 'saved', route: 'hv', label: 'JPEG' },
  ],
};

// Long-document RAG: coverage by task and budget (FORWARD final report Fig. 5, the heatmap's cell labels). Sorted by
// 10K, then 5K.
const ragCoverage: BarTable = {
  kind: 'bars',
  id: 'rag-coverage',
  width: 'text',
  label: 'Mean document coverage of the assembled context, by task and context budget',
  caption: {
    text: 'How much of each document is already in the context at each token budget. At 10K tokens it is about 100% of Qasper and ContractNLI and 96% of QuALITY, so wins there were mostly about order.',
  },
  rowHead: 'Task',
  colHead: 'Context budget (tokens)',
  cols: ['500', '1.5K', '5K', '10K'],
  rows: [
    { name: 'Qasper', values: [11, 35, 91, 100] },
    { name: 'ContractNLI', values: [14, 46, 94, 100] },
    { name: 'QuALITY', values: [7, 22, 75, 96] },
    { name: 'QMSum', values: [5, 15, 51, 89] },
    { name: 'NarrativeQA', values: [1, 5, 16, 32] },
  ],
  unit: '%',
};

export const DIAGRAMS: Record<string, DiagramSpec> = Object.fromEntries(
  [umi, framelight, memos, worldcup, ar, rag, photogleam, ragCoverage].map((d) => [d.id, d]),
);
