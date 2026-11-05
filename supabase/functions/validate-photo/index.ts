/**
 * validate-photo — Condition-aware photo quality gate using Google Cloud Vision.
 *
 * Payload:  { imageBase64, imageMimeType, shotType, appMode, patientCondition }
 * Response: { valid, reason, message, confidence }
 *
 * Shot types:
 *   crown    — top-down head shot; expects hair/scalp labels; blocks face selfies
 *   scalp    — close-up parted hair; expects scalp/hair labels
 *   hairline — front-facing forehead shot; expects hair+forehead combo; blocks full selfies
 *
 * Alopecia conditions use SCALP_LABELS instead of HAIR_LABELS (patient may be bald).
 * Fails open on any API/parse error so users are never hard-blocked.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HAIR_LABELS = new Set([
  'hair', 'hairstyle', 'human hair color', 'scalp',
  'hair coloring', 'black hair', 'brown hair', 'blond hair',
  'red hair', 'grey hair', 'white hair', 'long hair', 'short hair',
]);

// Used for alopecia patients who may be bald — scalp skin is the valid subject
const SCALP_LABELS = new Set([
  'scalp', 'skin', 'human skin', 'head', 'hair', 'hairstyle',
]);

// Labels that block crown/scalp shots (face selfie)
const FACE_LABELS = new Set([
  'face', 'human face', 'forehead', 'eye', 'nose', 'chin',
  'cheek', 'lip', 'mouth', 'ear', 'neck', 'jaw',
]);

// Labels that indicate a clearly wrong object — fires independently of hair detection
const WRONG_OBJECT_LABELS = new Set([
  // Surfaces & architecture
  'wall', 'ceiling', 'floor', 'architecture', 'room', 'interior design',
  'sky', 'wood', 'table', 'furniture', 'building', 'brick', 'concrete',
  'textile', 'fabric', 'tile', 'grass', 'plant', 'tree', 'road', 'street',
  // Animals (fur could loosely match hair labels)
  'dog', 'cat', 'animal', 'pet', 'wildlife', 'fur', 'mammal', 'canine', 'feline',
  // Food & drink
  'food', 'fruit', 'vegetable', 'drink', 'bottle', 'cup', 'dish', 'meal',
  // Electronics & objects
  'smartphone', 'mobile phone', 'telephone', 'computer', 'laptop', 'screen',
  'camera', 'electronic device', 'gadget',
  // Clothing & accessories
  'clothing', 'shirt', 'dress', 'shoe', 'bag', 'fashion accessory', 'jacket',
  // Paper & stationery
  'paper', 'book', 'document', 'notebook',
]);

// For hairline: block only if it looks like a FULL face selfie (eyes + nose + mouth)
const FULL_SELFIE_LABELS = new Set(['eye', 'nose', 'mouth', 'lip', 'chin']);

const ALOPECIA_CONDITIONS = new Set([
  'androgenic_alopecia', 'alopecia_areata', 'telogen_effluvium',
  'post_hair_transplant_fue', 'post_hair_transplant_fut', 'prp_hair',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();
    const {
      imageBase64,
      imageMimeType: _mime,
      shotType = 'crown',
      appMode = 'demo',
      patientCondition = '',
    } = payload;

    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');

    if (!apiKey) {
      return jsonOk({ valid: true, reason: 'valid', message: '', confidence: 0.99 });
    }

    const isAlopecia = ALOPECIA_CONDITIONS.has(patientCondition);

    // ── Call GCV label detection ──────────────────────────────────────────────
    const gcvStart = Date.now();
    const resp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'LABEL_DETECTION', maxResults: 15 }],
          }],
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!resp.ok) {
      console.error('GCV error:', resp.status, await resp.text());
      return jsonOk({ valid: true, reason: 'validation_skipped', message: '', confidence: 0.5 });
    }

    const data = await resp.json();
    const gcvMs = Date.now() - gcvStart;
    const annotations = data?.responses?.[0]?.labelAnnotations ?? [];

    const labels: Record<string, number> = {};
    for (const ann of annotations) {
      labels[ann.description.toLowerCase()] = ann.score;
    }

    console.log(`GCV timing: ${gcvMs}ms | shot=${shotType}${patientCondition ? ` cond=${patientCondition}` : ''} | labels:`, JSON.stringify(labels));

    // ── Shared: wrong-object check fires for ALL shot types ──────────────────
    // Independent of hair detection — a photo of a dog with some hair label
    // should still be rejected.
    const wrongObjectScore = Object.entries(labels)
      .filter(([label]) => WRONG_OBJECT_LABELS.has(label))
      .reduce((max, [, score]) => Math.max(max, score), 0);
    const isWrongObject = wrongObjectScore >= 0.60;

    // ── HAIRLINE shot ─────────────────────────────────────────────────────────
    if (shotType === 'hairline') {
      // Block full selfies (eyes + nose + mouth all present)
      const fullSelfieCount = Object.entries(labels).filter(
        ([label, score]) => FULL_SELFIE_LABELS.has(label) && score >= 0.70
      ).length;
      if (fullSelfieCount >= 3) {
        return jsonOk({
          valid: false,
          reason: 'full_selfie',
          message: "This looks like a full selfie. Focus on your hairline — the camera should show where hair meets skin, not your whole face.",
          confidence: 0.9,
        });
      }

      if (isWrongObject) {
        return jsonOk({
          valid: false,
          reason: 'wrong_object',
          message: 'This does not look like hair or a head. Aim the camera at your hairline and forehead.',
          confidence: wrongObjectScore,
        });
      }

      // Accept if any hair label or forehead/hairline is visible
      const hasHairOrForehead = Object.entries(labels).some(
        ([label, score]) => (HAIR_LABELS.has(label) || label === 'forehead' || label === 'hairline') && score >= 0.45
      );
      if (!hasHairOrForehead) {
        return jsonOk({
          valid: false,
          reason: 'no_hair_visible',
          message: 'No hair or hairline detected. Point the camera at where your hair meets your forehead.',
          confidence: 0.65,
        });
      }

      const best = Math.max(0, ...Object.entries(labels)
        .filter(([l]) => HAIR_LABELS.has(l) || l === 'forehead')
        .map(([, s]) => s));
      return jsonOk({ valid: true, reason: 'valid', message: '', confidence: best || 0.75 });
    }

    // ── CROWN and SCALP shots ─────────────────────────────────────────────────

    // Choose label set based on condition
    const activeHairLabels = isAlopecia ? SCALP_LABELS : HAIR_LABELS;
    const hairThreshold = isAlopecia ? 0.50 : 0.60;

    const hasHair = Object.entries(labels).some(
      ([label, score]) => activeHairLabels.has(label) && score >= hairThreshold
    );

    // Face selfie check — crown only, not for alopecia (bald forehead may trigger)
    const hasFace = shotType === 'crown' && !isAlopecia && Object.entries(labels).some(
      ([label, score]) => FACE_LABELS.has(label) && score >= 0.75
    );

    if (hasFace) {
      return jsonOk({
        valid: false,
        reason: 'face_selfie',
        message: 'This looks like a face selfie. Hold the phone above your head pointing straight down.',
        confidence: Math.max(0, ...Object.entries(labels).filter(([l]) => FACE_LABELS.has(l)).map(([, s]) => s)),
      });
    }

    // Wrong object: fires independently — reject even if a hair label also matched
    if (isWrongObject) {
      return jsonOk({
        valid: false,
        reason: 'wrong_object',
        message: shotType === 'crown'
          ? 'This does not look like hair or a head. Point camera straight down at your crown.'
          : 'This does not look like hair or scalp. Part your hair and try again.',
        confidence: wrongObjectScore,
      });
    }

    if (!hasHair) {
      const noHairMessage = isAlopecia
        ? 'Top of your head not visible. Hold the phone directly above your head pointing straight down.'
        : shotType === 'crown'
        ? 'Hair not detected. Hold the phone directly above your head and point it straight down so your crown fills the frame.'
        : 'Hair not detected. Part your hair and aim the camera straight down at the parting so scalp is visible.';
      return jsonOk({ valid: false, reason: 'no_hair_visible', message: noHairMessage, confidence: 0.65 });
    }

    const hairScore = Math.max(0, ...Object.entries(labels)
      .filter(([l]) => activeHairLabels.has(l))
      .map(([, s]) => s));
    return jsonOk({ valid: true, reason: 'valid', message: '', confidence: hairScore });

  } catch (err) {
    console.error('validate-photo error:', String(err));
    return jsonOk({ valid: true, reason: 'validation_skipped', message: '', confidence: 0.5 });
  }
});

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
