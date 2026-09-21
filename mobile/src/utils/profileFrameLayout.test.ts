import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrainHexProfile } from '../constants/brainHexProfiles';
import { FRAME_CANVAS_SIZE, getProfileFrameLayout } from './profileFrameLayout';

const profiles: BrainHexProfile[] = ['achiever', 'conqueror', 'daredevil', 'mastermind', 'seeker', 'socializer', 'survivor'];

for (const profile of profiles) {
  test(`keeps the photo centered in the ${profile} opening at every avatar size`, () => {
    for (const size of [56, 66, 72, 88, 104, 112]) {
      const { opening, photoSize, photoLeft, photoTop } = getProfileFrameLayout(profile, size);
      const scale = size / FRAME_CANVAS_SIZE;
      assert.ok(Math.abs(photoLeft + photoSize / 2 - opening.x * scale) < 1e-9);
      assert.ok(Math.abs(photoTop + photoSize / 2 - opening.y * scale) < 1e-9);
      assert.ok(photoLeft >= 0 && photoTop >= 0);
      assert.ok(photoLeft + photoSize <= size && photoTop + photoSize <= size);
      assert.ok(photoSize / 2 > opening.radius * scale);
      assert.ok(photoSize / 2 < (opening.radius + 6) * scale);
    }
  });
}
