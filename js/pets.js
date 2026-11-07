// The pilots of Tinkoki Airlines. Body points are in metres in the pet's own
// frame (x forward, y up), before any giant scaling.
import { buildLokiGlb, LOKI_NODES } from './loki.js';
import { buildTinkerGlb, TINKER_NODES, TINKER_TAIL_SEGMENTS } from './tinker.js';

export const PETS = {
  loki: {
    id: 'loki',
    name: 'Loki',
    emoji: '🐕',
    breed: 'Golden Retriever',
    flight: 'LK-1',
    travelClass: 'Very Good Boy',
    snacks: 'Unlimited',
    goal: '🎾 fetch the tennis balls',
    build: buildLokiGlb,
    nodes: LOKI_NODES,
    clearance: 0.45,   // body centre to paws
    camDist: 7,
    eyes: [0.92, 0.33],
    head: [0.75, 0.75],
    tailSegments: 4,
    balls: true,
    voice: 'bark',
    groundVerb: 'Galloping',
    // Dog ears hang down, so they swing back with negative rotation
    earSwing: -1,
    tail: { rate: 9, amp: 0.25, groundLift: 0.35, groundCurl: 0.05 },
    cloth: { twist: 0.25, side: 0.6, wave: 0.3 },
  },
  tinker: {
    id: 'tinker',
    name: 'Tinker',
    emoji: '🐈',
    breed: 'Tabby Cat',
    flight: 'TK-1',
    travelClass: 'Purrfect Pilot',
    snacks: 'Tuna',
    goal: '☁️ no chores, just fly free',
    build: buildTinkerGlb,
    nodes: TINKER_NODES,
    clearance: 0.3,
    camDist: 5,
    eyes: [0.56, 0.17],
    head: [0.45, 0.42],
    tailSegments: TINKER_TAIL_SEGMENTS,
    balls: false,
    voice: 'meow',
    groundVerb: 'Scampering',
    // Cat ears point up, so they flatten back with positive rotation
    earSwing: 1,
    tail: { rate: 3.5, amp: 0.18, groundLift: -0.9, groundCurl: 0.22 },
    cloth: { twist: 0.08, side: 0.12, wave: 0.55 },
  },
};
