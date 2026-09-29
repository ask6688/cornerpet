function GlassMaterial({ color }: { color: string }) {
  return <meshPhysicalMaterial color={color} roughness={.035} transmission={1} thickness={.65} ior={1.45}
    transparent depthWrite={false} toneMapped={false} clearcoat={.65} clearcoatRoughness={.04} envMapIntensity={.85}
    onBeforeCompile={shader => {
      // Keep the selected pigment visible while the lower glass stays lighter.
      shader.vertexShader = 'varying float vGlassHeight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassHeight = position.y;');
      shader.fragmentShader = 'varying float vGlassHeight;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float tint = smoothstep(-0.9, 0.85, vGlassHeight);
        diffuseColor.rgb = pow(diffuseColor.rgb, vec3(mix(1.0, 1.25, tint)));
      `);
      // Transparent Canvas has no photographed backdrop. Keep empty refraction
      // samples luminous, while alpha lets the real page/desktop show through.
      shader.fragmentShader = shader.fragmentShader.replace('#include <transmission_fragment>', `#include <transmission_fragment>
        totalDiffuse += (1.0 - material.transmissionAlpha) * diffuseColor.rgb;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
        vec3 glassReflection = totalSpecular + (clearcoatSpecularDirect + clearcoatSpecularIndirect) * material.clearcoat;
        float reflection = max(max(glassReflection.r, glassReflection.g), glassReflection.b);
        float rim = pow(1.0 - abs(dot(normal, geometryViewDir)), 5.0);
        // Compact studio highlights follow reflection direction, never the face.
        vec3 reflectedDirection = inverseTransformDirection(reflect(-geometryViewDir, normal), viewMatrix);
        float sparkle = pow(max(dot(reflectedDirection, normalize(vec3(-0.65, 0.7, 1.0))), 0.0), 170.0)
          + 0.8 * pow(max(dot(reflectedDirection, normalize(vec3(0.65, 1.1, 1.0))), 0.0), 220.0)
          + 0.5 * pow(max(dot(reflectedDirection, normalize(vec3(-1.2, 0.4, 0.9))), 0.0), 280.0);
        float highlight = smoothstep(0.08, 0.55, sparkle);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb, 0.65);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(4.0), highlight);
        gl_FragColor.a = clamp(0.32 + tint * 0.35 + reflection * 0.4 + rim * 0.16 + highlight, 0.0, 1.0);
      `);
    }} />;
}

export function BodyMaterial({ kind, color }: { kind: string; color: string }) {
  if (kind === 'jelly') return <meshPhysicalMaterial key={kind} color={color} roughness={.14} transmission={.42} thickness={.72} ior={1.32} clearcoat={.78} clearcoatRoughness={.12} sheen={.18} sheenColor="#FFF8F4" />;
  if (kind === 'cream') return <meshPhysicalMaterial key={kind} color={color} roughness={.46} sheen={.9} sheenColor="#FFF8EF" sheenRoughness={.66} clearcoat={.2} clearcoatRoughness={.35} />;
  if (kind === 'candy') return <GlassMaterial color={color} />;
  return <meshPhysicalMaterial key={kind} color={color} roughness={.84} sheen={.28} sheenColor="#FFF8F1" sheenRoughness={.88} clearcoat={.02} />;
}

