const requiredWeb = [
  'NEXT_PUBLIC_DALEELY_ADAPTER',
  'DALEELY_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
];
const optionalLocal = ['TELEPHONY_BACKEND_URL','TELEPHONY_API_SECRET','LLM_URL','ASR_URL','TTS_URL'];
let failed = false;
for (const key of requiredWeb) {
  const ok = Boolean(process.env[key]);
  console.log(`${ok ? 'OK ' : 'MISS'} ${key}`);
  if (!ok) failed = true;
}
for (const key of optionalLocal) console.log(`${process.env[key] ? 'OK ' : 'OPT '} ${key}`);
if (failed) process.exitCode = 1;
