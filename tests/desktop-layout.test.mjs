import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FOOTPRINT as body, DESKTOP_SIZE, desktopDragPosition, containPet, resizedPetBounds, visibleViewport, bubblePlacement, imageFootprint, validFootprint, desktopScaleLimits } from '../desktop/layout.mjs';

test('custom sizes extend presets and fit the current display', () => {
  assert.deepEqual(desktopScaleLimits({ width: 1920, height: 1080 }), { min: .5, max: 2.5 });
  for (const area of [{ width: 800, height: 600 }, { width: 640, height: 480 }, { width: 400, height: 900 }]) {
    const limits = desktopScaleLimits(area);
    assert.ok(limits.max * DESKTOP_SIZE.width <= area.width);
    assert.ok(limits.max * DESKTOP_SIZE.height <= area.height);
    assert.ok(limits.max > 1.25);
  }
});

test('a speaking pet can hop across the top-space threshold without flipping its bubble', () => {
  const viewport = { x: 0, y: 0, width: 320, height: 280 };
  for (const below of [false, true]) {
    let previous;
    for (const y of [60, 55, 51, 43, 51, 55, 60]) {
      const placement = bubblePlacement({ x: 70, y, width: 180, height: 185 }, viewport, 42, below);
      assert.equal(placement.below, below);
      assert.ok(placement.y >= 4 && placement.y + 42 <= 276);
      if (previous) assert.ok(Math.abs(placement.y - previous.y) <= 8);
      previous = placement;
    }
  }
});

test('desktop movement uses visible pet bounds at every size, including negative-coordinate displays', () => {
  for (const area of [{x:0,y:0,width:1440,height:900}, {x:-1920,y:-240,width:1920,height:1080}]) {
    for (const scale of [.65, .75, 1, 1.25, 1.35]) {
      for (const position of [{x:-9999,y:-9999}, {x:9999,y:9999}]) {
        const next = containPet(position, area, body, scale);
        assert.ok(next.x + body.x * scale >= area.x - .51);
        assert.ok(next.y + body.y * scale >= area.y - .51);
        assert.ok(next.x + (body.x + body.width) * scale <= area.x + area.width + .51);
        assert.ok(next.y + (body.y + body.height) * scale <= area.y + area.height + .51);
      }
      const start = {x:100,y:200,cursor:{x:150,y:250}};
      assert.equal(desktopDragPosition(start, {x:152,y:252}, area, body, scale).moved, false);
      assert.equal(desktopDragPosition(start, {x:160,y:265}, area, body, scale).moved, true);
    }
  }
});

test('resizing keeps feet planted and speech remains in the visible part of the window', () => {
  const area = {x:0,y:0,width:1920,height:1080};
  const old = {x:400,y:300,...DESKTOP_SIZE};
  const next = resizedPetBounds(old, 1, 1.25, body, area);
  assert.equal(next.width, 350); assert.equal(next.height, 400);
  assert.ok(Math.abs(next.y + (body.y + body.height)*1.25 - old.y - body.y - body.height) <= .5);
  for (const scale of [.65,1,1.35]) {
    for (const position of [{x:-9999,y:-9999}, {x:9999,y:9999}, {x:400,y:300}]) {
      const bounds = {...containPet(position,area,body,scale),width:280*scale,height:320*scale};
      const viewport = visibleViewport(bounds,scale,area);
      const bubble = bubblePlacement(body,viewport);
      assert.ok(bubble.x >= viewport.x && bubble.y >= viewport.y);
      assert.ok(bubble.x + bubble.width <= viewport.x + viewport.width + 1);
      assert.ok(bubble.y + 60 <= viewport.y + viewport.height + 1);
      assert.ok(bubble.tail >= 16 && bubble.tail <= bubble.width-16);
    }
  }
  assert.ok(validFootprint(imageFootprint(1000,1000,{x:100,y:80,width:800,height:850})));
  for (const rect of [null, {}, {...body,x:-1}, {...body,width:Infinity}, {...body,y:300}, {...body,height:0}]) assert.ok(!validFootprint(rect));
});
