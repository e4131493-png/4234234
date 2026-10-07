export const FORT_SECTION = '/Script/FortniteGame.FortGameUserSettings';
export const PRESETS = {
  competitive: { label: 'Competitive', scale: 100, textures: 0, distance: 1 },
  balanced: { label: 'Balanced', scale: 100, textures: 2, distance: 2 },
  potato: { label: 'Maximum FPS', scale: 70, textures: 0, distance: 0 }
};
export const REGISTRY_OPTIONS = {
  capture: [
    { path: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', name: 'AppCaptureEnabled', value: 0 },
    { path: 'HKCU:\\System\\GameConfigStore', name: 'GameDVR_Enabled', value: 0 }
  ],
  gameMode: [{ path: 'HKCU:\\Software\\Microsoft\\GameBar', name: 'AutoGameModeEnabled', value: 1 }]
};
export function validateOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose your settings first.');
  const allowed = ['preset', 'fpsCap', 'scale', 'fortnite', 'capture', 'gameMode', 'power'];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new Error('Unknown setting.');
  if (!Object.hasOwn(PRESETS, input.preset)) throw new Error('Unknown preset.');
  if (![0, 60, 120, 144, 160, 165, 180, 200, 240, 277, 280, 360].includes(input.fpsCap)) throw new Error('Unsupported FPS cap.');
  if (!Number.isInteger(input.scale) || input.scale < 50 || input.scale > 100) throw new Error('Resolution scale must be 50–100%.');
  for (const key of ['fortnite', 'capture', 'gameMode', 'power']) if (typeof input[key] !== 'boolean') throw new Error(`Invalid ${key} option.`);
  if (!['fortnite', 'capture', 'gameMode', 'power'].some(key => input[key])) throw new Error('Select at least one optimization.');
  return { ...input };
}
export function desiredIni(options) {
  const p = PRESETS[options.preset];
  return {
    ScalabilityGroups: {
      'sg.ResolutionQuality': `${options.scale}.000000`, 'sg.ViewDistanceQuality': String(p.distance),
      'sg.AntiAliasingQuality': '0', 'sg.ShadowQuality': '0', 'sg.GlobalIlluminationQuality': '0',
      'sg.ReflectionQuality': '0', 'sg.PostProcessQuality': '0', 'sg.TextureQuality': String(p.textures),
      'sg.EffectsQuality': '0', 'sg.FoliageQuality': '0', 'sg.ShadingQuality': '0'
    },
    [FORT_SECTION]: { bUseVSync: 'False', bMotionBlur: 'False', bUseDynamicResolution: 'False', bShowFPS: 'True', FrameRateLimit: `${options.fpsCap}.000000` }
  };
}
