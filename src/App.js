import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "./firebase";
import {
  collection, doc, getDocs, setDoc, deleteDoc, updateDoc, onSnapshot, getDoc
} from "firebase/firestore";

// ─── CONSTANTS ───────────────────────────────────────────────
// API key is stored securely in Vercel environment variables, not here.
const DEFAULT_VIBES = ["Casual / Errands", "Date Night", "Active / Sporty", "Smart Casual", "Formal / Event"];
const SHELF_REASONS = ["Too small", "Too big", "Specific occasions only", "Retire / donate", "At dry cleaner"];
const CATEGORIES = ["Top", "Bottom", "Shoes", "Outerwear", "Accessory", "Full outfit"];
const EMPTY_STYLE_PROFILE = { summary: "", outfitLog: [], patternCount: 0 };

// ─── HELPERS ─────────────────────────────────────────────────
function ItemThumb({ item, size = 40 }) {
  if (item.photoURL) return (
    <img src={item.photoURL} alt={item.name}
      style={{ width: size, height: size, borderRadius: size * 0.25, objectFit: "cover", flexShrink: 0, border: "1px solid #2a2a2a" }} />
  );
  const initials = item.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const hue = (item.name.charCodeAt(0) * 37 + (item.name.charCodeAt(1) || 0) * 13) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.25, background: `hsl(${hue},18%,18%)`, border: `1px solid hsl(${hue},18%,26%)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: size * 0.3, color: `hsl(${hue},40%,62%)`, fontWeight: 600 }}>
      {initials}
    </div>
  );
}

async function callClaude(systemPrompt, userContent, maxTokens = 600) {
  // Calls our own Vercel serverless function (/api/claude) which securely
  // forwards the request to Anthropic with the API key on the server side.
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("").trim();
}

// Photos are stored directly in Firestore as compressed base64 — no Storage needed
async function compressPhoto(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const maxSize = 600;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
        else { width = Math.round(width * maxSize / height); height = maxSize; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.65));
    };
    img.src = dataUrl;
  });
}

function b64(dataUrl) { return dataUrl.split(",")[1]; }

// Reads and compresses a photo before use — prevents large iPhone photos failing
function readPhoto(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 1200;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
          else { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── MAIN APP ────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dressed");
  const [appReady, setAppReady] = useState(false);

  // ── Persisted state (from Firebase) ──
  const [wardrobe, setWardrobe] = useState([]);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [styleProfile, setStyleProfile] = useState(EMPTY_STYLE_PROFILE);
  const [vibes, setVibes] = useState(DEFAULT_VIBES);

  // ── Session state ──
  const [prompt, setPrompt] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [vibe, setVibe] = useState("");
  const [hours, setHours] = useState("3");
  const [locationInput, setLocationInput] = useState("Austin, TX");
  const [weather, setWeather] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState(null);
  const [feedbackInput, setFeedbackInput] = useState("");

  const [outfitPhoto, setOutfitPhoto] = useState(null);
  const [photoFeedback, setPhotoFeedback] = useState(null);
  const [photoFeedbackLoading, setPhotoFeedbackLoading] = useState(false);
  const [showSaveOutfit, setShowSaveOutfit] = useState(false);
  const [outfitSaveName, setOutfitSaveName] = useState("");
  const [savingOutfit, setSavingOutfit] = useState(false);

  const [showOwnOutfitModal, setShowOwnOutfitModal] = useState(false);
  const [ownOutfitPhoto, setOwnOutfitPhoto] = useState(null);
  const [ownOutfitNote, setOwnOutfitNote] = useState("");
  const [ownOutfitVibe, setOwnOutfitVibe] = useState("");
  const [ownOutfitAnalysing, setOwnOutfitAnalysing] = useState(false);
  const [ownOutfitDone, setOwnOutfitDone] = useState(false);

  const [showSavedDetail, setShowSavedDetail] = useState(null);
  const [showShelfModal, setShowShelfModal] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showItemDetail, setShowItemDetail] = useState(null);
  const [newItem, setNewItem] = useState({ name: "", category: "Top", material: "", notes: "" });
  const [newItemPhoto, setNewItemPhoto] = useState(null);
  const [namingItem, setNamingItem] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [customVibeInput, setCustomVibeInput] = useState("");
  const [showVibeEditor, setShowVibeEditor] = useState(false);

  const addPhotoRef = useRef();
  const itemPhotoRef = useRef();
  const outfitPhotoRef = useRef();
  const ownOutfitPhotoRef = useRef();

  const activeWardrobe = wardrobe.filter(i => !i.shelved);
  const shelvedItems = wardrobe.filter(i => i.shelved);

  // ── LOAD FROM FIREBASE ON MOUNT ──────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        // Wardrobe — real-time listener
        onSnapshot(collection(db, "wardrobe"), snap => {
          const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          setWardrobe(items);
        });

        // Saved outfits — real-time
        onSnapshot(collection(db, "savedOutfits"), snap => {
          const outfits = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          outfits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setSavedOutfits(outfits);
        });

        // Style profile
        const profileDoc = await getDoc(doc(db, "config", "styleProfile"));
        if (profileDoc.exists()) setStyleProfile(profileDoc.data());

        // Vibes
        const vibesDoc = await getDoc(doc(db, "config", "vibes"));
        if (vibesDoc.exists()) setVibes(vibesDoc.data().list || DEFAULT_VIBES);

      } catch (e) {
        console.error("Firebase load error:", e);
      } finally {
        setAppReady(true);
      }
    }
    loadData();
  }, []);

  // ── WEATHER ──────────────────────────────────────────────────
  async function fetchWeather() {
    setLoadingWeather(true);
    try {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationInput)}&count=1`);
      const geoData = await geo.json();
      if (!geoData.results?.length) { setWeather({ error: "Location not found" }); return; }
      const { latitude, longitude, name, country } = geoData.results[0];
      const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&temperature_unit=fahrenheit`);
      const wxData = await wx.json();
      const c = wxData.current;
      setWeather({ temp: Math.round(c.temperature_2m), humidity: c.relative_humidity_2m, code: c.weather_code, location: `${name}, ${country}` });
    } catch { setWeather({ error: "Couldn't fetch weather" }); }
    finally { setLoadingWeather(false); }
  }

  function weatherDesc(code) {
    if (code == null) return "";
    if (code === 0) return "Clear sky";
    if (code <= 3) return "Partly cloudy";
    if (code <= 48) return "Foggy";
    if (code <= 67) return "Rainy";
    if (code <= 77) return "Snowy";
    if (code <= 82) return "Showers";
    return "Stormy";
  }

  // ── STYLE PROFILE ────────────────────────────────────────────
  function styleProfileContext() {
    if (!styleProfile.summary && styleProfile.patternCount === 0) return "";
    return `Style profile (from ${styleProfile.patternCount} outfit${styleProfile.patternCount !== 1 ? "s" : ""} logged): ${styleProfile.summary}`;
  }

  async function updateStyleProfile(newLog) {
    const allLogs = [...(styleProfile.outfitLog || []), newLog];
    let summary = styleProfile.summary;

    if (allLogs.length < 2) {
      summary = "Just getting started — keep logging outfits to build your style profile.";
    } else {
      const logText = allLogs.map(l => `[${l.date} · ${l.source} · ${l.vibe || "no vibe"}] ${l.itemNames} — ${l.notes || "none"}`).join("\n");
      try {
        summary = await callClaude(
          `You are a personal stylist building a style profile from outfit history. Write a concise 3-5 sentence summary of this person's style preferences based on what they've actually worn. Focus on colours, fit, materials, vibes, comfort preferences. Plain text only, no headers.`,
          `Outfit log:\n${logText}`,
          300
        );
      } catch {}
    }

    const updated = { summary, outfitLog: allLogs, patternCount: allLogs.length };
    setStyleProfile(updated);
    await setDoc(doc(db, "config", "styleProfile"), updated);
  }

  // ── GET OUTFIT RECOMMENDATION ────────────────────────────────
  async function getOutfit() {
    if (!prompt || !vibe) return;
    setLoading(true);
    setRecommendation(null);
    setFeedbackMode(null);
    setOutfitPhoto(null);
    setPhotoFeedback(null);
    setShowSaveOutfit(false);

    const items = activeWardrobe.map(i => ({ id: i.id, name: i.name, category: i.category, material: i.material, notes: i.notes, feedbackTags: i.feedbackTags || [] }));
    const wx = weather && !weather.error ? `Weather: ${weather.temp}°F, ${weather.humidity}% humidity, ${weatherDesc(weather.code)}.` : "";
    const ctx = extraContext.trim() ? `Extra context: ${extraContext}` : "";
    const styleCtx = styleProfileContext();
    const savedMem = savedOutfits.length > 0 ? `Combos he's worn and liked: ${savedOutfits.slice(0, 8).map(o => o.name).join("; ")}` : "";

    try {
      const text = await callClaude(
        `You are a calm, confident personal stylist helping someone with ADHD who gets anxious about outfit decisions. Pick ONE complete outfit. Be decisive — no alternatives. Use the style profile. Give a SHORT 2-3 sentence explanation mentioning his personal style. Respond ONLY with valid JSON: {"items":[array of item IDs],"explanation":"..."}`,
        [
          `Available wardrobe: ${JSON.stringify(items)}`,
          wx, `Going to: ${prompt}`, `Vibe: ${vibe}`, `Duration: ${hours} hours`,
          ctx, styleCtx, savedMem, "Pick the single best outfit."
        ].filter(Boolean).join("\n")
      );
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setRecommendation({ items: wardrobe.filter(i => parsed.items.includes(i.id)), explanation: parsed.explanation });
    } catch {
      setRecommendation({ error: "Couldn't generate outfit. Try again." });
    } finally { setLoading(false); }
  }

  // ── FEEDBACK ON RECOMMENDATION ───────────────────────────────
  async function submitFeedback(type) {
    if (!recommendation?.items) return;
    setLoading(true);
    const items = activeWardrobe.map(i => ({ id: i.id, name: i.name, category: i.category, material: i.material, notes: i.notes, feedbackTags: i.feedbackTags || [] }));
    const wx = weather && !weather.error ? `Weather: ${weather.temp}°F, ${weather.humidity}% humidity.` : "";
    try {
      const text = await callClaude(
        `You are a personal stylist. User rejected an outfit. Pick a better one. Respond ONLY with valid JSON: {"items":[IDs],"explanation":"2-3 sentences","feedbackTag":"short tag for rejected items"}`,
        `Available: ${JSON.stringify(items)}\n${wx}\nGoing to: ${prompt}, Vibe: ${vibe}\n${extraContext ? `Extra: ${extraContext}` : ""}\n${styleProfileContext()}\nRejected: ${recommendation.items.map(i => i.name).join(", ")}\nFeedback: ${type} — ${feedbackInput || "none"}`
      );
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (parsed.feedbackTag) {
        for (const item of recommendation.items) {
          const updated = { ...item, feedbackTags: [...new Set([...(item.feedbackTags || []), parsed.feedbackTag])] };
          await updateDoc(doc(db, "wardrobe", String(item.id)), { feedbackTags: updated.feedbackTags });
        }
      }
      setRecommendation({ items: wardrobe.filter(i => parsed.items.includes(i.id)), explanation: parsed.explanation });
      setFeedbackMode(null);
      setFeedbackInput("");
      setOutfitPhoto(null);
      setPhotoFeedback(null);
      setShowSaveOutfit(false);
    } catch {
      setRecommendation(prev => ({ ...prev, error: "Couldn't process feedback." }));
    } finally { setLoading(false); }
  }

  // ── OUTFIT PHOTO ANALYSIS ────────────────────────────────────
  async function analyseOutfitPhoto(photo) {
    setPhotoFeedbackLoading(true);
    setPhotoFeedback(null);
    try {
      const text = await callClaude(
        `You are a warm personal stylist. User put on their recommended outfit and took a photo. Give honest specific feedback on fit, proportions, colour harmony (2-3 sentences). Give ONE concrete tweak if needed or confirm it looks great. Verdict must be: "This looks great — wear it!" or "Try this tweak: [suggestion]". Respond ONLY with valid JSON: {"feedback":"...","verdict":"...","lookGood":true/false}`,
        [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(photo) } },
          { type: "text", text: `Outfit: ${recommendation.items.map(i => i.name).join(", ")}\nVibe: ${vibe}` }
        ],
        400
      );
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setPhotoFeedback(parsed);
      if (parsed.lookGood) setShowSaveOutfit(true);
    } catch {
      setPhotoFeedback({ feedback: "Couldn't analyse the photo.", verdict: "", lookGood: false });
    } finally { setPhotoFeedbackLoading(false); }
  }

  // ── SAVE RECOMMENDED OUTFIT ──────────────────────────────────
  async function saveOutfit() {
    if (!recommendation?.items) return;
    setSavingOutfit(true);
    const name = outfitSaveName.trim() || recommendation.items.map(i => i.name.split(" ")[0]).join(" + ");
    const id = Date.now().toString();
    let photoURL = null;
    if (outfitPhoto) {
      try { photoURL = await compressPhoto(outfitPhoto); } catch {}
    }
    const outfit = {
      id, name,
      itemIds: recommendation.items.map(i => i.id),
      photoURL,
      notes: photoFeedback?.feedback || "",
      vibe, source: "app",
      createdAt: Date.now(),
      savedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })
    };
    await setDoc(doc(db, "savedOutfits", id), outfit);
    await updateStyleProfile({
      date: outfit.savedAt, source: "app recommendation (worn)",
      vibe, prompt,
      itemNames: recommendation.items.map(i => i.name).join(", "),
      notes: photoFeedback?.feedback || ""
    });
    setShowSaveOutfit(false);
    setOutfitSaveName("");
    setFeedbackMode("done");
    setSavingOutfit(false);
  }

  // ── LOG OWN OUTFIT ───────────────────────────────────────────
  async function analyseAndLogOwnOutfit() {
    if (!ownOutfitPhoto) return;
    setOwnOutfitAnalysing(true);
    const id = Date.now().toString();
    try {
      const text = await callClaude(
        `You are a personal stylist building a style profile. Look at this outfit photo and identify: colours, fit style, layering, aesthetic. Respond ONLY with valid JSON: {"description":"what you see","styleInsight":"2-3 sentences about preferences","tags":["3-5 short style tags"]}`,
        [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64(ownOutfitPhoto) } },
          { type: "text", text: `Analyse this outfit.\n${ownOutfitVibe ? `Vibe: ${ownOutfitVibe}` : ""}\n${ownOutfitNote ? `Note: ${ownOutfitNote}` : ""}` }
        ],
        400
      );
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      let photoURL = null;
      try { photoURL = await compressPhoto(ownOutfitPhoto); } catch {}
      const outfit = {
        id,
        name: `Own choice · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        itemIds: [],
        photoURL,
        notes: parsed.styleInsight,
        vibe: ownOutfitVibe || "",
        source: "own",
        tags: parsed.tags || [],
        createdAt: Date.now(),
        savedAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })
      };
      await setDoc(doc(db, "savedOutfits", id), outfit);
      await updateStyleProfile({
        date: outfit.savedAt, source: "own choice",
        vibe: ownOutfitVibe || "unspecified",
        itemNames: parsed.description,
        notes: `${parsed.styleInsight} Tags: ${parsed.tags?.join(", ") || ""}`
      });
      setOwnOutfitDone(true);
    } catch { setOwnOutfitDone(true); }
    finally { setOwnOutfitAnalysing(false); }
  }

  function closeOwnOutfitModal() {
    setShowOwnOutfitModal(false);
    setOwnOutfitPhoto(null);
    setOwnOutfitNote("");
    setOwnOutfitVibe("");
    setOwnOutfitDone(false);
  }

  // ── ADD WARDROBE ITEM ─────────────────────────────────────────
  async function nameItemFromPhoto(dataUrl) {
    setNamingItem(true);
    setNewItemPhoto(dataUrl);
    try {
      const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
      let mediaType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!supported.includes(mediaType)) mediaType = "image/jpeg";

      const text = await callClaude(
        `You are a wardrobe assistant. Identify this clothing item. Respond ONLY with valid JSON, no extra text: {"name":"concise name e.g. Navy Wool Blazer","category":"Top|Bottom|Shoes|Outerwear|Accessory|Full outfit","material":"likely material or blank if unsure"}`,
        [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64(dataUrl) } },
          { type: "text", text: "What clothing item is this? Reply with JSON only." }
        ],
        200
      );
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setNewItem(prev => ({
        ...prev,
        name: parsed.name || prev.name,
        category: parsed.category || prev.category,
        material: parsed.material || prev.material
      }));
    } catch (e) {
      console.error("Auto-name failed:", e);
      // Show a gentle prompt so user knows to type it manually
      setNewItem(prev => ({ ...prev, name: prev.name || "" }));
      alert("Couldn't auto-name this item — just type the name yourself! Everything else still works fine.");
    } finally {
      setNamingItem(false);
    }
  }

  async function addItem() {
    if (!newItem.name) return;
    setSavingItem(true);
    const id = Date.now().toString();
    let photoURL = null;
    if (newItemPhoto) {
      try { photoURL = await compressPhoto(newItemPhoto); } catch {}
    }
    const item = { id, ...newItem, photoURL, shelved: null, feedbackTags: [], createdAt: Date.now() };
    await setDoc(doc(db, "wardrobe", id), item);
    setNewItem({ name: "", category: "Top", material: "", notes: "" });
    setNewItemPhoto(null);
    setShowAddModal(false);
    setSavingItem(false);
  }

  async function updateItemPhoto(itemId, dataUrl) {
    let photoURL = null;
    try { photoURL = await compressPhoto(dataUrl); } catch {}
    await updateDoc(doc(db, "wardrobe", String(itemId)), { photoURL });
    if (showItemDetail?.id === itemId) setShowItemDetail(prev => ({ ...prev, photoURL }));
  }

  async function shelfItem(itemId, reason) {
    await updateDoc(doc(db, "wardrobe", String(itemId)), { shelved: reason });
    setShowShelfModal(null);
    if (recommendation?.items?.find(i => i.id === itemId)) setRecommendation(null);
  }

  async function unshelfItem(itemId) {
    await updateDoc(doc(db, "wardrobe", String(itemId)), { shelved: null });
  }

  async function deleteSavedOutfit(outfitId) {
    await deleteDoc(doc(db, "savedOutfits", outfitId));
    setShowSavedDetail(null);
  }

  async function saveVibes(newVibes) {
    setVibes(newVibes);
    await setDoc(doc(db, "config", "vibes"), { list: newVibes });
  }

  function addVibe() {
    const trimmed = customVibeInput.trim();
    if (!trimmed || vibes.includes(trimmed)) return;
    const updated = [...vibes, trimmed];
    saveVibes(updated);
    setCustomVibeInput("");
  }

  function removeVibe(v) {
    saveVibes(vibes.filter(x => x !== v));
    if (vibe === v) setVibe("");
  }

  async function removeFeedbackTag(item, tag) {
    const updated = (item.feedbackTags || []).filter(t => t !== tag);
    await updateDoc(doc(db, "wardrobe", String(item.id)), { feedbackTags: updated });
    setShowItemDetail(prev => prev ? { ...prev, feedbackTags: updated } : null);
  }

  // ── STYLES ───────────────────────────────────────────────────
  const iS = { width: "100%", background: "#1e1e1e", padding: "12px 15px", borderRadius: 12, fontSize: 14, marginBottom: 9, color: "#f0ede8", border: "none", outline: "none", fontFamily: "'DM Sans', sans-serif" };
  const sL = { fontSize: 10, letterSpacing: 2.5, color: "#555", textTransform: "uppercase", marginBottom: 9, display: "block" };

  // ── LOADING SCREEN ───────────────────────────────────────────
  if (!appReady) return (
    <div style={{ background: "#0f0f0f", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid #1e1e1e", borderTop: "2px solid #c8a96e", animation: "spin .8s linear infinite" }} />
      <p style={{ color: "#555", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Loading your wardrobe…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── RENDER ───────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0f0f0f", minHeight: "100vh", color: "#f0ede8", maxWidth: 430, margin: "0 auto" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{display:none}
        input,select,textarea{outline:none;border:none;background:transparent;color:#f0ede8;font-family:'DM Sans',sans-serif}
        button{cursor:pointer;border:none;font-family:'DM Sans',sans-serif}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .fu{animation:fadeUp .4s ease forwards}
        .fu2{animation:fadeUp .4s ease .1s forwards;opacity:0}
        .fu3{animation:fadeUp .4s ease .2s forwards;opacity:0}
        .ch:hover{background:#1c1c1c!important}
        .spin{animation:spin .8s linear infinite}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ padding: "52px 24px 18px", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>Your</p>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 400 }}>Fit Check</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => { setShowOwnOutfitModal(true); setOwnOutfitDone(false); }} style={{ background: "#181818", padding: "9px 14px", borderRadius: 20, fontSize: 12, color: "#c8a96e", fontWeight: 500, border: "1px solid #2a2a2a" }}>
              📷 Log outfit
            </button>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#c8a96e,#8b6914)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✦</div>
          </div>
        </div>
        {styleProfile.patternCount > 0 && (
          <div style={{ marginTop: 12, background: "#131313", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11 }}>🧠</span>
            <p style={{ fontSize: 11, color: "#666" }}>Style profile: <span style={{ color: "#c8a96e" }}>{styleProfile.patternCount} outfit{styleProfile.patternCount !== 1 ? "s" : ""} logged</span></p>
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
        {[["dressed","Get Dressed"],["wardrobe","Wardrobe"],["outfits",`Saved (${savedOutfits.length})`],["style","Style"],["shelved",`Shelved (${shelvedItems.length})`]].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "11px 0", fontSize: 10, fontWeight: tab===id?600:400, color: tab===id?"#f0ede8":"#484848", background: "none", borderBottom: tab===id?"2px solid #c8a96e":"2px solid transparent", transition: "all .2s", letterSpacing: .3 }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "24px", overflowY: "auto", minHeight: "calc(100vh - 165px)" }}>

        {/* ── GET DRESSED TAB ── */}
        {tab === "dressed" && <div>
          <div className="fu" style={{ marginBottom: 18 }}>
            <span style={sL}>Location</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={locationInput} onChange={e => setLocationInput(e.target.value)} placeholder="City, State" style={{ flex: 1, background: "#181818", padding: "12px 15px", borderRadius: 12, fontSize: 14 }} />
              <button onClick={fetchWeather} style={{ background: "#181818", padding: "12px 16px", borderRadius: 12, fontSize: 13, color: "#c8a96e", fontWeight: 600 }}>{loadingWeather ? "…" : "Fetch"}</button>
            </div>
            {weather && !weather.error && (
              <div style={{ marginTop: 9, background: "#131313", borderRadius: 12, padding: "11px 15px", display: "flex", justifyContent: "space-between" }}>
                <div><p style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>{weather.location}</p><p style={{ fontSize: 22, fontWeight: 600 }}>{weather.temp}°F <span style={{ fontSize: 13, color: "#777", fontWeight: 400 }}>{weatherDesc(weather.code)}</span></p></div>
                <div style={{ textAlign: "right" }}><p style={{ fontSize: 11, color: "#555" }}>Humidity</p><p style={{ fontSize: 18, fontWeight: 500 }}>{weather.humidity}%</p></div>
              </div>
            )}
            {weather?.error && <p style={{ marginTop: 8, fontSize: 12, color: "#b05555" }}>{weather.error}</p>}
          </div>

          <div className="fu2" style={{ marginBottom: 18 }}>
            <span style={sL}>Where are you going?</span>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. dinner at a nice restaurant, afternoon at a coffee shop…" rows={2} style={{ width: "100%", background: "#181818", padding: "13px 15px", borderRadius: 12, fontSize: 14, resize: "none", lineHeight: 1.55 }} />
          </div>

          <div className="fu2" style={{ marginBottom: 18 }}>
            <span style={sL}>Anything else to factor in? <em style={{ color: "#333", fontSize: 10, fontStyle: "normal" }}>(optional)</em></span>
            <textarea value={extraContext} onChange={e => setExtraContext(e.target.value)} placeholder="e.g. basement venue so cold, standing all evening, need pockets, dress code…" rows={2} style={{ width: "100%", background: "#181818", padding: "13px 15px", borderRadius: 12, fontSize: 14, resize: "none", lineHeight: 1.55 }} />
          </div>

          <div className="fu2" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
              <span style={{ ...sL, marginBottom: 0 }}>Vibe</span>
              <button onClick={() => setShowVibeEditor(v => !v)} style={{ fontSize: 11, color: "#c8a96e", background: "none" }}>{showVibeEditor ? "Done" : "✎ Edit vibes"}</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {vibes.map(v => (
                <div key={v} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                  <button onClick={() => setVibe(v)} style={{ padding: "8px 14px", borderRadius: 20, fontSize: 13, background: vibe===v?"#c8a96e":"#181818", color: vibe===v?"#0f0f0f":"#888", fontWeight: vibe===v?600:400, paddingRight: showVibeEditor&&!DEFAULT_VIBES.includes(v)?"28px":"14px", transition: "all .15s" }}>{v}</button>
                  {showVibeEditor && !DEFAULT_VIBES.includes(v) && <button onClick={() => removeVibe(v)} style={{ position: "absolute", right: 8, background: "none", color: "#666", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>}
                </div>
              ))}
            </div>
            {showVibeEditor && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input value={customVibeInput} onChange={e => setCustomVibeInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&addVibe()} placeholder="Add a custom vibe…" style={{ flex: 1, background: "#181818", padding: "10px 14px", borderRadius: 20, fontSize: 13 }} />
                <button onClick={addVibe} style={{ background: "#c8a96e", padding: "10px 16px", borderRadius: 20, fontSize: 13, color: "#0f0f0f", fontWeight: 600 }}>Add</button>
              </div>
            )}
          </div>

          <div className="fu3" style={{ marginBottom: 26 }}>
            <span style={sL}>How long? <span style={{ color: "#c8a96e", letterSpacing: 0, textTransform: "none", fontSize: 13 }}>{hours} hrs</span></span>
            <input type="range" min="1" max="12" value={hours} onChange={e => setHours(e.target.value)} style={{ width: "100%", accentColor: "#c8a96e" }} />
          </div>

          <button onClick={getOutfit} disabled={!prompt||!vibe||loading} style={{ width: "100%", padding: "15px", borderRadius: 14, background: prompt&&vibe&&!loading?"linear-gradient(135deg,#c8a96e,#8b6914)":"#181818", color: prompt&&vibe?"#0f0f0f":"#383838", fontSize: 16, fontWeight: 600, transition: "all .3s" }}>
            {loading ? "Finding your outfit…" : "What should I wear?"}
          </button>

          {loading && <div style={{ textAlign: "center", marginTop: 32 }}><div className="spin" style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #1e1e1e", borderTop: "2px solid #c8a96e", margin: "0 auto 14px" }} /><p style={{ color: "#555", fontSize: 13 }}>Checking your wardrobe{styleProfile.patternCount>0?" and style profile":""}…</p></div>}

          {recommendation && !loading && <div className="fu" style={{ marginTop: 26 }}>
            {recommendation.error ? <p style={{ color: "#b05555", fontSize: 14 }}>{recommendation.error}</p> : <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ fontSize: 10, letterSpacing: 2.5, color: "#c8a96e", textTransform: "uppercase" }}>Your outfit</p>
                <span style={{ fontSize: 10, color: "#333", letterSpacing: 1 }}>✦ CHOSEN FOR YOU</span>
              </div>
              <div style={{ background: "#131313", borderRadius: 16, overflow: "hidden", marginBottom: 14 }}>
                {recommendation.items.map((item, i) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 15px", borderBottom: i<recommendation.items.length-1?"1px solid #1a1a1a":"none" }}>
                    <ItemThumb item={item} size={46} />
                    <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{item.name}</p><p style={{ fontSize: 11, color: "#484848" }}>{item.category}{item.material?` · ${item.material}`:""}</p></div>
                    <button onClick={() => setShowShelfModal(item.id)} style={{ fontSize: 17, background: "none", color: "#2e2e2e", padding: "4px 8px" }}>⊘</button>
                  </div>
                ))}
              </div>
              <div style={{ background: "#131313", borderRadius: 13, padding: "15px", marginBottom: 18, borderLeft: "3px solid #c8a96e" }}>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: "#b8b4ad" }}>{recommendation.explanation}</p>
              </div>

              {feedbackMode !== "done" && <div style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 10, letterSpacing: 2, color: "#444", textTransform: "uppercase", marginBottom: 10 }}>Put it on & take a photo</p>
                {!outfitPhoto
                  ? <button onClick={() => outfitPhotoRef.current.click()} style={{ width: "100%", padding: "15px", borderRadius: 13, background: "#181818", border: "1px dashed #2a2a2a", fontSize: 13, color: "#555", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span style={{ fontSize: 18 }}>📸</span> Upload photo for fit feedback</button>
                  : <div style={{ borderRadius: 14, overflow: "hidden", position: "relative" }}><img src={outfitPhoto} alt="outfit" style={{ width: "100%", maxHeight: 300, objectFit: "cover", display: "block" }} /><button onClick={() => { setOutfitPhoto(null); setPhotoFeedback(null); setShowSaveOutfit(false); }} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,.7)", color: "#f0ede8", width: 30, height: 30, borderRadius: "50%", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button></div>
                }
                <input ref={outfitPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const f=e.target.files[0]; if(f){const d=await readPhoto(f);setOutfitPhoto(d);setPhotoFeedback(null);setShowSaveOutfit(false);analyseOutfitPhoto(d);}}} />
                {photoFeedbackLoading && <div style={{ textAlign: "center", padding: "16px 0" }}><div className="spin" style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #1e1e1e", borderTop: "2px solid #c8a96e", margin: "0 auto 10px" }} /><p style={{ fontSize: 12, color: "#555" }}>Analysing how it looks…</p></div>}
                {photoFeedback && !photoFeedbackLoading && <div className="fu" style={{ marginTop: 12 }}>
                  <div style={{ background: photoFeedback.lookGood?"#0d1a12":"#1a100d", borderRadius: 13, padding: "15px", borderLeft: `3px solid ${photoFeedback.lookGood?"#4caf82":"#c8694e"}`, marginBottom: 10 }}>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: "#c8c4bd", marginBottom: 8 }}>{photoFeedback.feedback}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: photoFeedback.lookGood?"#4caf82":"#c8a96e" }}>{photoFeedback.verdict}</p>
                  </div>
                  {!photoFeedback.lookGood && <button onClick={() => setFeedbackMode("photo-tweak")} style={{ width: "100%", padding: "12px", borderRadius: 12, background: "#181818", fontSize: 13, color: "#c8a96e" }}>Get a different outfit instead →</button>}
                  {showSaveOutfit && <div className="fu" style={{ marginTop: 10, background: "#131313", borderRadius: 13, padding: "14px" }}>
                    <p style={{ fontSize: 13, color: "#888", marginBottom: 9 }}>Save this combo to outfit memory?</p>
                    <input value={outfitSaveName} onChange={e => setOutfitSaveName(e.target.value)} placeholder={recommendation.items.map(i=>i.name.split(" ")[0]).join(" + ")} style={iS} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setShowSaveOutfit(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "#1e1e1e", fontSize: 13, color: "#555" }}>Skip</button>
                      <button onClick={saveOutfit} disabled={savingOutfit} style={{ flex: 2, padding: "11px", borderRadius: 10, background: "linear-gradient(135deg,#c8a96e,#8b6914)", fontSize: 13, color: "#0f0f0f", fontWeight: 600 }}>{savingOutfit?"Saving…":"✦ Save & teach my style"}</button>
                    </div>
                  </div>}
                </div>}
              </div>}

              {!feedbackMode && !photoFeedbackLoading && <div>
                <p style={{ fontSize: 10, letterSpacing: 2, color: "#383838", textTransform: "uppercase", marginBottom: 10, textAlign: "center" }}>How does it feel?</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {[["✓","Wearing this","worn"],["🌡","Wrong temp","temp"],["🎨","Wrong vibe","vibe"],["📐","Fit issue","fit"]].map(([icon,label,type]) => (
                    <button key={type} onClick={async () => {
                      if (type==="worn") {
                        await updateStyleProfile({ date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"}), source:"app recommendation (worn)", vibe, prompt, itemNames: recommendation.items.map(i=>i.name).join(", "), notes:"" });
                        setFeedbackMode("done");
                      } else setFeedbackMode(type);
                    }} style={{ padding: "11px", borderRadius: 12, background: "#181818", fontSize: 13, color: type==="worn"?"#c8a96e":"#777", fontWeight: type==="worn"?600:400, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>}

              {feedbackMode === "done" && <div className="fu" style={{ textAlign: "center", padding: "22px 0" }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>✦</p>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, color: "#c8a96e" }}>You're going to look great.</p>
                <p style={{ fontSize: 13, color: "#484848", marginTop: 6 }}>Go enjoy your {vibe.toLowerCase()}.</p>
              </div>}

              {feedbackMode && feedbackMode!=="done" && <div className="fu" style={{ marginTop: 14 }}>
                <textarea value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} placeholder={feedbackMode==="temp"?"e.g. too hot, too cold…":feedbackMode==="vibe"?"e.g. too casual…":"e.g. too tight in shoulders…"} rows={2} style={{ width: "100%", background: "#181818", padding: "12px 14px", borderRadius: 12, fontSize: 13, resize: "none", marginBottom: 9 }} />
                <div style={{ display: "flex", gap: 7 }}>
                  <button onClick={() => { setFeedbackMode(null); setFeedbackInput(""); }} style={{ flex: 1, padding: "12px", borderRadius: 12, background: "#181818", fontSize: 13, color: "#555" }}>Cancel</button>
                  <button onClick={() => submitFeedback(feedbackMode)} style={{ flex: 2, padding: "12px", borderRadius: 12, background: "linear-gradient(135deg,#c8a96e,#8b6914)", fontSize: 13, color: "#0f0f0f", fontWeight: 600 }}>Try a different outfit</button>
                </div>
              </div>}
            </>}
          </div>}
        </div>}

        {/* ── WARDROBE TAB ── */}
        {tab === "wardrobe" && <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: "#484848" }}>{activeWardrobe.length} items</p>
            <button onClick={() => setShowAddModal(true)} style={{ background: "linear-gradient(135deg,#c8a96e,#8b6914)", padding: "8px 16px", borderRadius: 20, fontSize: 13, color: "#0f0f0f", fontWeight: 600 }}>+ Add item</button>
          </div>
          {CATEGORIES.map(cat => {
            const items = activeWardrobe.filter(i => i.category === cat);
            if (!items.length) return null;
            return <div key={cat} style={{ marginBottom: 26 }}>
              <p style={{ fontSize: 10, letterSpacing: 2.5, color: "#555", textTransform: "uppercase", marginBottom: 11 }}>{cat}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {items.map(item => (
                  <div key={item.id} className="ch" onClick={() => setShowItemDetail(item)} style={{ borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#131313", border: "1px solid #1e1e1e", transition: "background .15s" }}>
                    <div style={{ aspectRatio: "1/1.15", background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                      {item.photoURL ? <img src={item.photoURL} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}><ItemThumb item={item} size={42} /><p style={{ fontSize: 8, color: "#333", letterSpacing: 1.5 }}>ADD PHOTO</p></div>}
                      {(item.feedbackTags||[]).length>0 && <div style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: "#c8a96e" }} />}
                    </div>
                    <div style={{ padding: "8px 9px 10px" }}>
                      <p style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3, color: "#ccc8c0" }}>{item.name}</p>
                      {item.material && <p style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{item.material}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>;
          })}
        </div>}

        {/* ── SAVED OUTFITS TAB ── */}
        {tab === "outfits" && <div>
          <p style={{ fontSize: 13, color: "#484848", marginBottom: 20 }}>{savedOutfits.length} outfit{savedOutfits.length!==1?"s":""} logged</p>
          {savedOutfits.length===0 && <div style={{ textAlign: "center", marginTop: 50 }}><p style={{ fontSize: 26, marginBottom: 12 }}>✦</p><p style={{ color: "#444", fontSize: 13, lineHeight: 1.7 }}>No outfits logged yet.<br/>Tap <span style={{ color: "#c8a96e" }}>📷 Log outfit</span> to add what you wore.</p></div>}
          {savedOutfits.map(outfit => (
            <div key={outfit.id} className="ch" onClick={() => setShowSavedDetail(outfit)} style={{ borderRadius: 14, overflow: "hidden", background: "#131313", border: "1px solid #1e1e1e", marginBottom: 10, cursor: "pointer", transition: "background .15s" }}>
              <div style={{ display: "flex" }}>
                {outfit.photoURL && <img src={outfit.photoURL} alt={outfit.name} style={{ width: 80, height: 80, objectFit: "cover", flexShrink: 0 }} />}
                <div style={{ padding: "12px 14px", flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>{outfit.name}</p>
                    {outfit.source==="own" && <span style={{ fontSize: 10, background: "#1e1a12", color: "#c8a96e", padding: "2px 7px", borderRadius: 10 }}>own choice</span>}
                  </div>
                  <p style={{ fontSize: 11, color: "#484848", marginBottom: 6 }}>{outfit.vibe ? `${outfit.vibe} · ` : ""}{outfit.savedAt}</p>
                  {outfit.tags?.length>0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{outfit.tags.slice(0,3).map(t => <span key={t} style={{ fontSize: 10, background: "#1e1e1e", color: "#555", padding: "2px 7px", borderRadius: 10 }}>{t}</span>)}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>}

        {/* ── STYLE PROFILE TAB ── */}
        {tab === "style" && <div>
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, marginBottom: 6 }}>Style profile</p>
            <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>Builds automatically from every outfit logged.</p>
          </div>
          {styleProfile.patternCount===0
            ? <div style={{ background: "#131313", borderRadius: 14, padding: "24px", textAlign: "center" }}><p style={{ fontSize: 28, marginBottom: 12 }}>🧠</p><p style={{ fontSize: 14, color: "#666", lineHeight: 1.7 }}>No style data yet.<br/>Tap <span style={{ color: "#c8a96e" }}>📷 Log outfit</span> to start.</p></div>
            : <>
              <div style={{ background: "#131313", borderRadius: 14, padding: "18px", marginBottom: 16, borderLeft: "3px solid #c8a96e" }}>
                <p style={{ fontSize: 10, letterSpacing: 2, color: "#c8a96e", textTransform: "uppercase", marginBottom: 10 }}>What I've learned</p>
                <p style={{ fontSize: 14, lineHeight: 1.75, color: "#c8c4bd" }}>{styleProfile.summary}</p>
              </div>
              <div style={{ background: "#131313", borderRadius: 14, padding: "15px" }}>
                <p style={{ fontSize: 10, letterSpacing: 2, color: "#555", textTransform: "uppercase", marginBottom: 12 }}>Outfit history</p>
                {(styleProfile.outfitLog||[]).slice().reverse().map((log, i, arr) => (
                  <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 12, borderBottom: i<arr.length-1?"1px solid #1a1a1a":"none", marginBottom: i<arr.length-1?12:0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#2a2a2a", flexShrink: 0, marginTop: 5 }} />
                    <div><p style={{ fontSize: 12, color: "#777", marginBottom: 3 }}>{log.date} · <span style={{ color: log.source?.includes("own")?"#c8a96e":"#555" }}>{log.source}</span></p><p style={{ fontSize: 13, color: "#c8c4bd", lineHeight: 1.5 }}>{log.itemNames}</p>{log.vibe&&<p style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{log.vibe}</p>}</div>
                  </div>
                ))}
              </div>
              <button onClick={async () => { if(window.confirm("Clear all style learning data?")) { await setDoc(doc(db,"config","styleProfile"), EMPTY_STYLE_PROFILE); setStyleProfile(EMPTY_STYLE_PROFILE); }}} style={{ width: "100%", marginTop: 16, padding: "12px", borderRadius: 12, background: "#131313", fontSize: 13, color: "#444" }}>Reset style profile</button>
            </>
          }
        </div>}

        {/* ── SHELVED TAB ── */}
        {tab === "shelved" && <div>
          <p style={{ fontSize: 13, color: "#484848", marginBottom: 18 }}>{shelvedItems.length} items shelved</p>
          {shelvedItems.length===0 && <p style={{ color: "#333", fontSize: 14, textAlign: "center", marginTop: 50 }}>Nothing shelved yet.</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {shelvedItems.map(item => (
              <div key={item.id} style={{ borderRadius: 12, overflow: "hidden", background: "#111", border: "1px solid #1a1a1a", opacity: .55 }}>
                <div style={{ aspectRatio: "1/1.15", background: "#161616", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {item.photoURL ? <img src={item.photoURL} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(70%)" }} /> : <ItemThumb item={item} size={38} />}
                </div>
                <div style={{ padding: "8px 9px 10px" }}>
                  <p style={{ fontSize: 11, color: "#666", lineHeight: 1.3 }}>{item.name}</p>
                  <p style={{ fontSize: 10, color: "#3a3a3a", marginTop: 2 }}>{item.shelved}</p>
                  <button onClick={() => unshelfItem(item.id)} style={{ fontSize: 11, color: "#c8a96e", background: "none", marginTop: 5, padding: 0 }}>Restore</button>
                </div>
              </div>
            ))}
          </div>
        </div>}
      </div>

      {/* ── LOG OWN OUTFIT MODAL ── */}
      {showOwnOutfitModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "flex-end", zIndex: 200 }} onClick={e => e.target===e.currentTarget&&closeOwnOutfitModal()}>
          <div style={{ background: "#181818", borderRadius: "22px 22px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", overflow: "hidden", maxHeight: "92vh", overflowY: "auto" }}>
            {ownOutfitDone ? (
              <div style={{ padding: "48px 28px", textAlign: "center" }}>
                <p style={{ fontSize: 36, marginBottom: 14 }}>🧠</p>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#c8a96e", marginBottom: 10 }}>Style noted.</p>
                <p style={{ fontSize: 14, color: "#666", lineHeight: 1.7, marginBottom: 28 }}>{styleProfile.patternCount<=1?"First outfit logged! Keep adding more.": `${styleProfile.patternCount} outfits logged. Recommendations keep improving.`}</p>
                <button onClick={closeOwnOutfitModal} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "linear-gradient(135deg,#c8a96e,#8b6914)", fontSize: 15, color: "#0f0f0f", fontWeight: 600 }}>Done</button>
              </div>
            ) : <>
              <div onClick={() => ownOutfitPhotoRef.current.click()} style={{ width: "100%", height: 200, background: "#121212", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                {ownOutfitPhoto ? <img src={ownOutfitPhoto} alt="outfit" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center", opacity: .35 }}><p style={{ fontSize: 36, marginBottom: 8 }}>📷</p><p style={{ fontSize: 13, color: "#888", letterSpacing: 1 }}>TAP TO ADD PHOTO</p></div>}
                {ownOutfitPhoto && <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,.7)", padding: "6px 12px", borderRadius: 20, fontSize: 11, color: "#c8a96e" }}>Change</div>}
                <input ref={ownOutfitPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const f=e.target.files[0]; if(f) setOwnOutfitPhoto(await readPhoto(f)); }} />
              </div>
              <div style={{ padding: "22px 24px 28px" }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, marginBottom: 4 }}>What did you wear?</p>
                <p style={{ fontSize: 13, color: "#555", marginBottom: 20, lineHeight: 1.55 }}>Whether you picked it yourself or went a different way — log it and the app will learn your style.</p>
                <span style={sL}>Vibe <em style={{ color: "#333", fontSize: 10, fontStyle: "normal" }}>(optional)</em></span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                  {vibes.map(v => <button key={v} onClick={() => setOwnOutfitVibe(v===ownOutfitVibe?"":v)} style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12, background: ownOutfitVibe===v?"#c8a96e":"#232323", color: ownOutfitVibe===v?"#0f0f0f":"#777", fontWeight: ownOutfitVibe===v?600:400 }}>{v}</button>)}
                </div>
                <span style={sL}>Notes <em style={{ color: "#333", fontSize: 10, fontStyle: "normal" }}>(optional)</em></span>
                <textarea value={ownOutfitNote} onChange={e => setOwnOutfitNote(e.target.value)} placeholder="e.g. felt really comfortable, loved this, too hot…" rows={2} style={{ width: "100%", background: "#232323", padding: "12px 14px", borderRadius: 12, fontSize: 13, resize: "none", marginBottom: 18 }} />
                <button onClick={analyseAndLogOwnOutfit} disabled={!ownOutfitPhoto||ownOutfitAnalysing} style={{ width: "100%", padding: "14px", borderRadius: 12, background: ownOutfitPhoto&&!ownOutfitAnalysing?"linear-gradient(135deg,#c8a96e,#8b6914)":"#232323", color: ownOutfitPhoto?"#0f0f0f":"#383838", fontSize: 15, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {ownOutfitAnalysing ? <><div className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(0,0,0,.3)", borderTop: "2px solid #0f0f0f" }} />Analysing your style…</> : "✦ Log this outfit"}
                </button>
                <button onClick={closeOwnOutfitModal} style={{ width: "100%", padding: "12px", borderRadius: 12, background: "none", fontSize: 14, color: "#484848" }}>Cancel</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* ── SHELF MODAL ── */}
      {showShelfModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={() => setShowShelfModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#191919", borderRadius: "20px 20px 0 0", padding: "26px 24px", width: "100%", maxWidth: 430, margin: "0 auto" }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, marginBottom: 5 }}>Shelf this item?</p>
            <p style={{ fontSize: 13, color: "#484848", marginBottom: 18 }}>It won't appear in outfit suggestions.</p>
            {SHELF_REASONS.map(r => <button key={r} onClick={() => shelfItem(showShelfModal, r)} style={{ width: "100%", textAlign: "left", padding: "13px 16px", borderRadius: 12, background: "#232323", marginBottom: 7, fontSize: 14, color: "#c8c4bd", display: "block" }}>{r}</button>)}
            <button onClick={() => setShowShelfModal(null)} style={{ width: "100%", padding: "13px", borderRadius: 12, background: "none", fontSize: 14, color: "#484848" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── ITEM DETAIL MODAL ── */}
      {showItemDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={() => setShowItemDetail(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#191919", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", overflow: "hidden" }}>
            <div style={{ width: "100%", height: 220, background: "#141414", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
              {showItemDetail.photoURL ? <img src={showItemDetail.photoURL} alt={showItemDetail.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: .4 }}><ItemThumb item={showItemDetail} size={64} /><p style={{ fontSize: 11, color: "#555", letterSpacing: 1 }}>NO PHOTO YET</p></div>}
              <button onClick={() => itemPhotoRef.current.click()} style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,.72)", padding: "7px 14px", borderRadius: 20, fontSize: 12, color: "#c8a96e" }}>{showItemDetail.photoURL?"Change photo":"+ Add photo"}</button>
              <input ref={itemPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const f=e.target.files[0]; if(f) updateItemPhoto(showItemDetail.id, await readPhoto(f)); }} />
            </div>
            <div style={{ padding: "20px 22px 28px" }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, marginBottom: 3 }}>{showItemDetail.name}</p>
              <p style={{ fontSize: 13, color: "#484848", marginBottom: 12 }}>{showItemDetail.category}{showItemDetail.material?` · ${showItemDetail.material}`:""}</p>
              {showItemDetail.notes && <p style={{ fontSize: 13, color: "#777", marginBottom: 14, lineHeight: 1.55 }}>{showItemDetail.notes}</p>}
              {(showItemDetail.feedbackTags||[]).length>0 && <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, letterSpacing: 2, color: "#484848", textTransform: "uppercase", marginBottom: 8 }}>Learned preferences</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(showItemDetail.feedbackTags||[]).map(t => (
                    <span key={t} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, background: "#1e1a12", color: "#c8a96e", fontSize: 12 }}>
                      {t}<button onClick={() => removeFeedbackTag(showItemDetail, t)} style={{ background: "none", color: "#8b6914", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowShelfModal(showItemDetail.id); setShowItemDetail(null); }} style={{ flex: 1, padding: "13px", borderRadius: 12, background: "#232323", fontSize: 14, color: "#777" }}>Shelf item</button>
                <button onClick={() => setShowItemDetail(null)} style={{ flex: 1, padding: "13px", borderRadius: 12, background: "none", fontSize: 14, color: "#484848" }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SAVED OUTFIT DETAIL ── */}
      {showSavedDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={() => setShowSavedDetail(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#191919", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", overflow: "hidden" }}>
            {showSavedDetail.photoURL && <img src={showSavedDetail.photoURL} alt={showSavedDetail.name} style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }} />}
            <div style={{ padding: "20px 22px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 21 }}>{showSavedDetail.name}</p>
                {showSavedDetail.source==="own" && <span style={{ fontSize: 10, background: "#1e1a12", color: "#c8a96e", padding: "2px 8px", borderRadius: 10 }}>own choice</span>}
              </div>
              <p style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>{showSavedDetail.vibe?`${showSavedDetail.vibe} · `:""}{showSavedDetail.savedAt}</p>
              {showSavedDetail.tags?.length>0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>{showSavedDetail.tags.map(t=><span key={t} style={{ fontSize: 11, background: "#1e1e1e", color: "#666", padding: "3px 9px", borderRadius: 10 }}>{t}</span>)}</div>}
              {showSavedDetail.notes && <div style={{ background: "#131313", borderRadius: 12, padding: "12px 14px", marginBottom: 14, borderLeft: "3px solid #c8a96e" }}><p style={{ fontSize: 13, color: "#888", lineHeight: 1.55 }}>{showSavedDetail.notes}</p></div>}
              {showSavedDetail.itemIds?.length>0 && <div style={{ marginBottom: 14 }}>{showSavedDetail.itemIds.map(id=>{const item=wardrobe.find(w=>w.id===id);return item?<div key={id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}><ItemThumb item={item} size={30} /><p style={{ fontSize: 13, color: "#c8c4bd" }}>{item.name}</p></div>:null;})}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => deleteSavedOutfit(showSavedDetail.id)} style={{ flex: 1, padding: "13px", borderRadius: 12, background: "#232323", fontSize: 13, color: "#666" }}>Delete</button>
                <button onClick={() => setShowSavedDetail(null)} style={{ flex: 2, padding: "13px", borderRadius: 12, background: "none", fontSize: 14, color: "#484848" }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD ITEM MODAL ── */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={() => setShowAddModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#191919", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", overflow: "hidden" }}>
            <div onClick={() => addPhotoRef.current.click()} style={{ width: "100%", height: 160, background: "#141414", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden" }}>
              {newItemPhoto ? <img src={newItemPhoto} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ textAlign: "center", opacity: .35 }}><p style={{ fontSize: 26, marginBottom: 7 }}>📷</p><p style={{ fontSize: 12, color: "#888", letterSpacing: 1.5 }}>TAP TO ADD PHOTO</p></div>}
              {newItemPhoto && <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.65)", padding: "5px 11px", borderRadius: 20, fontSize: 11, color: "#c8a96e" }}>Change</div>}
              <input ref={addPhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const f=e.target.files[0]; if(f) nameItemFromPhoto(await readPhoto(f)); }} />
            </div>
            <div style={{ padding: "20px 22px 24px" }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, marginBottom: 16 }}>Add a new item</p>
              <div style={{ position: "relative", marginBottom: 9 }}>
                <input value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder={namingItem?"Identifying item…":"Item name"} disabled={namingItem} style={{ ...iS, marginBottom: 0, paddingRight: namingItem?"42px":"15px", opacity: namingItem?.5:1 }} />
                {namingItem && <div className="spin" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, borderRadius: "50%", border: "2px solid #333", borderTop: "2px solid #c8a96e" }} />}
              </div>
              <select value={newItem.category} onChange={e => setNewItem({...newItem,category:e.target.value})} style={iS}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
              <input value={newItem.material} onChange={e => setNewItem({...newItem,material:e.target.value})} placeholder="Material (e.g. linen, cotton)" style={iS} />
              <input value={newItem.notes} onChange={e => setNewItem({...newItem,notes:e.target.value})} placeholder="Notes (e.g. runs warm, very breathable)" style={{ ...iS, marginBottom: 16 }} />
              <button onClick={addItem} disabled={!newItem.name||savingItem} style={{ width: "100%", padding: "14px", borderRadius: 12, background: newItem.name&&!savingItem?"linear-gradient(135deg,#c8a96e,#8b6914)":"#232323", color: newItem.name?"#0f0f0f":"#383838", fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                {savingItem ? "Saving…" : "Add to wardrobe"}
              </button>
              <button onClick={() => { setShowAddModal(false); setNamingItem(false); setNewItem({name:"",category:"Top",material:"",notes:""}); setNewItemPhoto(null); }} style={{ width: "100%", padding: "13px", borderRadius: 12, background: "none", fontSize: 14, color: "#484848" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
