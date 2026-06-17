// src/App.jsx
import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal.jsx";
import { fbGet, fbSet, fbGetHistory, fbSaveHistory, fbDeleteHistory } from "./firebase.js";
import { SEED_ITEMS, SHIFTS, ADMIN_PASSWORD, slugify, buildDefaultStock } from "./constants.js";

function App() {
  const [items, setItems] = useState({ alcohol: [], cigarettes: [] });
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [morningStock, setMorningStock] = useState({});
  const [eveningStock, setEveningStock] = useState({});
  const [morningName, setMorningName] = useState("");
  const [eveningName, setEveningName] = useState("");
  const [inventoryHistory, setInventoryHistory] = useState([]);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  const [activeShift, setActiveShift] = useState("morning");
  const [activeTab, setActiveTab] = useState("cigarettes");
  const [adminMode, setAdminMode] = useState(false);
  const [adminScreen, setAdminScreen] = useState("dashboard");
  const [showHistory, setShowHistory] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  const [tempPrice, setTempPrice] = useState("");
  const [summaryDate, setSummaryDate] = useState(null);
  const [interShiftOpen, setInterShiftOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());

  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("cigarettes");
  const [itemSaving, setItemSaving] = useState(false);
  const [itemMsg, setItemMsg] = useState("");

  const today = new Date().toLocaleDateString("en-TT", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
  const todayKey = new Date().toISOString().split("T")[0];

  // ── Load from Firebase ────────────────────────────────────────────────
  const loadFromCloud = useCallback(async () => {
    setSyncing(true);
    setSyncStatus("Loading from Firebase...");
    try {
      const [todayDoc, hist, itemsDoc] = await Promise.all([
        fbGet(`day_${todayKey}`),
        fbGetHistory(),
        fbGet("items"),
      ]);

      let loadedItems = SEED_ITEMS;
      if (itemsDoc && itemsDoc.alcohol && itemsDoc.cigarettes) {
        loadedItems = itemsDoc;
      } else {
        await fbSet("items", SEED_ITEMS);
      }
      setItems(loadedItems);
      setItemsLoaded(true);

      if (todayDoc) {
        if (todayDoc.morningStock) setMorningStock(todayDoc.morningStock);
        if (todayDoc.eveningStock) setEveningStock(todayDoc.eveningStock);
        if (todayDoc.morningName) setMorningName(todayDoc.morningName);
        if (todayDoc.eveningName) setEveningName(todayDoc.eveningName);
      }
      setInventoryHistory(hist);
      setSyncStatus(`✅ Loaded — ${hist.length} days of history`);
      setTimeout(() => setSyncStatus(""), 3000);
    } catch(e) {
      console.error(e);
      setSyncStatus("❌ Firebase error — check console");
      setTimeout(() => setSyncStatus(""), 4000);
    }
    setSyncing(false);
  }, [todayKey]);

  useEffect(() => { loadFromCloud(); }, []);

  const allItems = [...(items.alcohol||[]), ...(items.cigarettes||[])];

  const getStock = shift => shift === "morning" ? morningStock : eveningStock;
  const setStock = shift => shift === "morning" ? setMorningStock : setEveningStock;

  const updateStock = (shift, id, field, value) => {
    const num = value === "" ? "" : Math.max(0, parseInt(value) || 0);
    setStock(shift)(prev => ({ ...prev, [id]: { ...prev[id], [field]: num } }));
  };

  const getQtySold = (shift, id) => {
    const s = getStock(shift)[id] || { opening:0, closing:0 };
    return Math.max(0, (parseInt(s.opening)||0) - (parseInt(s.closing)||0));
  };

  const getPrice = id => {
    const item = allItems.find(i => i.id === id);
    return item ? item.price : 0;
  };

  const getSalesValue = (shift, id) => getQtySold(shift, id) * getPrice(id);

  const calcTotals = (shift, category) =>
    (items[category]||[]).reduce((acc, item) => {
      const sold = getQtySold(shift, item.id);
      acc.value += getSalesValue(shift, item.id);
      acc.sold += sold;
      acc.soldValue += sold * getPrice(item.id);
      return acc;
    }, { value:0, sold:0, soldValue:0 });

  const shiftGrandTotals = shift => {
    const a = calcTotals(shift, "alcohol");
    const c = calcTotals(shift, "cigarettes");
    return { value: a.value+c.value, soldValue: a.soldValue+c.soldValue, sold: a.sold+c.sold };
  };

  const calcStockValue = (stockData, category) => {
    return (items[category]||[]).reduce((acc, item) => {
      const s = stockData[item.id] || { opening:0, closing:0 };
      const p = getPrice(item.id);
      acc.opening += (parseInt(s.opening)||0) * p;
      acc.closing += (parseInt(s.closing)||0) * p;
      return acc;
    }, { opening:0, closing:0 });
  };

  const getStockDataForDate = (date) => {
    if (date === todayKey) {
      return { morning: { stock: morningStock, name: morningName }, evening: { stock: eveningStock, name: eveningName } };
    }
    const entry = inventoryHistory.find(e => e.date === date);
    if (!entry) return null;
    return { morning: { stock: entry.morning.stock, name: entry.morning.employeeName }, evening: { stock: entry.evening.stock, name: entry.evening.employeeName } };
  };

  // ── Save to Firebase ──────────────────────────────────────────────────
  const handleSave = async () => {
    setSyncing(true);
    setSyncStatus("Saving to Firebase...");
    const historyEntry = {
      date: todayKey,
      dateDisplay: today,
      morning: { employeeName: morningName, stock: JSON.parse(JSON.stringify(morningStock)), totals: shiftGrandTotals("morning"), cigTotals: calcTotals("morning","cigarettes"), alcTotals: calcTotals("morning","alcohol") },
      evening: { employeeName: eveningName, stock: JSON.parse(JSON.stringify(eveningStock)), totals: shiftGrandTotals("evening"), cigTotals: calcTotals("evening","cigarettes"), alcTotals: calcTotals("evening","alcohol") },
      savedAt: new Date().toLocaleString(),
    };
    const results = await Promise.all([
      fbSet(`day_${todayKey}`, { morningStock: JSON.parse(JSON.stringify(morningStock)), eveningStock: JSON.parse(JSON.stringify(eveningStock)), morningName, eveningName, updatedAt: new Date().toLocaleString() }),
      fbSaveHistory(historyEntry),
    ]);
    if (results.every(Boolean)) {
      await loadFromCloud();
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 2500);
    } else {
      setSyncStatus("❌ Save failed — check Firebase rules");
      setTimeout(() => setSyncStatus(""), 4000);
    }
    setSyncing(false);
  };

  const handleReset = shift => {
    if (window.confirm(`Reset ALL stock counts for ${SHIFTS[shift].label} to zero?`)) {
      setStock(shift)(buildDefaultStock(items));
    }
  };

  const handleAdminLogin = () => {
    if (pwInput === ADMIN_PASSWORD) {
      setAdminMode(true); setAdminScreen("dashboard"); setShowAdminModal(false); setPwInput(""); setPwError(false);
    } else { setPwError(true); }
  };

  const commitPrice = async (id) => {
    const val = parseFloat(tempPrice);
    if (!isNaN(val) && val >= 0) {
      const newItems = {
        alcohol: (items.alcohol||[]).map(i => i.id===id ? {...i, price: val} : i),
        cigarettes: (items.cigarettes||[]).map(i => i.id===id ? {...i, price: val} : i),
      };
      setItems(newItems);
      await fbSet("items", newItems);
    }
    setEditingPrice(null);
  };

  const handleAddItem = async () => {
    const name = newItemName.trim();
    const price = parseFloat(newItemPrice);
    if (!name) { setItemMsg("❌ Enter an item name"); return; }
    if (isNaN(price) || price < 0) { setItemMsg("❌ Enter a valid price"); return; }

    const id = slugify(name);
    const newItem = { id, name, price };
    const newItems = {
      ...items,
      [newItemCategory]: [...(items[newItemCategory]||[]), newItem],
    };

    setItemSaving(true);
    const ok = await fbSet("items", newItems);
    if (ok) {
      setItems(newItems);
      setNewItemName(""); setNewItemPrice("");
      setItemMsg(`✅ "${name}" added to ${newItemCategory}`);
      setTimeout(() => setItemMsg(""), 3000);
    } else {
      setItemMsg("❌ Failed to save — check Firebase");
    }
    setItemSaving(false);
  };

  const handleRemoveItem = async (category, id, name) => {
    if (!window.confirm(`Remove "${name}" from the list? This cannot be undone.`)) return;
    const newItems = {
      ...items,
      [category]: (items[category]||[]).filter(i => i.id !== id),
    };
    setItemSaving(true);
    const ok = await fbSet("items", newItems);
    if (ok) {
      setItems(newItems);
      setItemMsg(`✅ "${name}" removed`);
      setTimeout(() => setItemMsg(""), 3000);
    } else {
      setItemMsg("❌ Failed to remove — check Firebase");
    }
    setItemSaving(false);
  };

  const handleDeleteEntry = async (date, dateDisplay) => {
    if (!window.confirm(`Delete the entry for ${dateDisplay}? This cannot be undone.`)) return;
    const ok = await fbDeleteHistory(date);
    if (ok) setInventoryHistory(prev => prev.filter(e => e.date !== date));
  };

  const exportToCSV = () => {
    const rows = [["SHOP INVENTORY REPORT"], ["Generated:", new Date().toLocaleString()], []];
    inventoryHistory.forEach(entry => {
      rows.push([`=== ${entry.dateDisplay} ===`]);
      rows.push(["Saved at:", entry.savedAt]);
      rows.push([]);
      ["morning","evening"].forEach(shiftKey => {
        const sd = entry[shiftKey];
        rows.push([`${shiftKey.toUpperCase()} SHIFT - ${sd.employeeName||"Not entered"}`]);
        rows.push(["Category","Item","Opening","Closing","Sold","Sales ($)"]);
        ["alcohol","cigarettes"].forEach(cat => {
          (items[cat]||[]).forEach(item => {
            const s = sd.stock[item.id]||{opening:0,closing:0};
            const sold = Math.max(0, (parseInt(s.opening)||0)-(parseInt(s.closing)||0));
            const value = sold * item.price;
            rows.push([cat, item.name, s.opening||0, s.closing||0, sold, value.toFixed(2)]);
          });
        });
        rows.push(["TOTALS","","","",sd.totals.sold,sd.totals.value.toFixed(2)]);
        rows.push([]);
      });
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download = `inventory_${todayKey}.csv`;
    a.click();
  };

  const shift = SHIFTS[activeShift];
  const currentStock = getStock(activeShift);
  const grandTotals = shiftGrandTotals(activeShift);

  // ── Render Table ──────────────────────────────────────────────────────
  const renderTable = category => (
    <div style={{ overflowX:"auto", borderRadius:10, boxShadow:"0 2px 16px rgba(0,0,0,0.08)" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", background:"#fff", fontSize:13, minWidth:380 }}>
        <thead>
          <tr>
            {["Item", adminMode&&"Price ($)", "Opening", "Closing", "Sold", adminMode&&"Sales ($)"].filter(Boolean).map((h,i) => (
              <th key={i} style={{ background:shift.color, color:"#fff", padding:"10px 8px", fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px", textAlign:i===0?"left":"center", paddingLeft:i===0?14:8 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(items[category]||[]).length === 0 ? (
            <tr><td colSpan={6} style={{ padding:20, textAlign:"center", color:"#94a3b8" }}>No items yet — add some in Admin → Manage Items</td></tr>
          ) : (items[category]||[]).map((item,i) => {
            const s = currentStock[item.id]||{opening:"",closing:""};
            const sold = getQtySold(activeShift, item.id);
            const value = getSalesValue(activeShift, item.id);
            return (
              <tr key={item.id} style={{ background:i%2===0?"#fafbff":"#fff" }}>
                <td style={{ padding:"8px 8px 8px 14px", borderBottom:"1px solid #eee", fontWeight:600, color:"#1a2340" }}>{item.name}</td>
                {adminMode && (
                  <td style={{ padding:8, textAlign:"center", borderBottom:"1px solid #eee" }}>
                    {editingPrice===item.id ? (
                      <input type="number" step="0.01" value={tempPrice}
                        onChange={e => setTempPrice(e.target.value)}
                        onBlur={() => commitPrice(item.id)}
                        onKeyDown={e => e.key==="Enter"&&commitPrice(item.id)}
                        style={{ width:64, padding:"4px 6px", border:`2px solid ${shift.accent}`, borderRadius:6, textAlign:"center", fontSize:13, fontWeight:700 }} autoFocus />
                    ) : (
                      <span onClick={() => { setEditingPrice(item.id); setTempPrice(String(item.price)); }}
                        style={{ display:"inline-block", padding:"2px 6px", borderRadius:6, fontSize:13, fontWeight:700, color:"#1a2340", cursor:"pointer", borderBottom:`1px dashed ${shift.accent}` }}>${item.price.toFixed(2)}</span>
                    )}
                  </td>
                )}
                <td style={{ padding:8, textAlign:"center", borderBottom:"1px solid #eee" }}>
                  <input type="number" min="0" value={s.opening} placeholder="0"
                    onChange={e => updateStock(activeShift, item.id, "opening", e.target.value)}
                    style={{ width:60, padding:"5px 6px", border:`1.5px solid ${shift.accent}88`, borderRadius:6, textAlign:"center", fontSize:14, fontWeight:700, background:"#f8f9ff" }} />
                </td>
                <td style={{ padding:8, textAlign:"center", borderBottom:"1px solid #eee" }}>
                  <input type="number" min="0" value={s.closing} placeholder="0"
                    onChange={e => updateStock(activeShift, item.id, "closing", e.target.value)}
                    style={{ width:60, padding:"5px 6px", border:`1.5px solid ${shift.accent}88`, borderRadius:6, textAlign:"center", fontSize:14, fontWeight:700, background:"#f8f9ff" }} />
                </td>
                <td style={{ padding:8, textAlign:"center", borderBottom:"1px solid #eee", color:sold>0?"#15803d":"#ccc", fontWeight:700 }}>{sold}</td>
                {adminMode && <td style={{ padding:8, textAlign:"center", borderBottom:"1px solid #eee", fontWeight:700, color:"#1a2340" }}>${value.toFixed(2)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background:shift.color }}>
            <td colSpan={adminMode?4:3} style={{ padding:"9px 8px", color:"#fff", fontWeight:700, textAlign:"right", paddingRight:12 }}>
              {category==="cigarettes"?"🚬":"🍺"} Totals
            </td>
            <td style={{ padding:8, textAlign:"center", color:"#fde68a", fontWeight:800 }}>{calcTotals(activeShift,category).sold}</td>
            {adminMode && <td style={{ padding:8, textAlign:"center", color:"#fde68a", fontWeight:800 }}>${calcTotals(activeShift,category).value.toFixed(2)}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  // ── Cross-day discrepancy computation ──────────────────────────────────
  const crossDayAlerts = (() => {
    const sorted = [...inventoryHistory].sort((a,b) => a.date.localeCompare(b.date));
    const alerts = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const curr = sorted[i];
      const next = sorted[i+1];
      const currData = getStockDataForDate(curr.date);
      const nextData = getStockDataForDate(next.date);
      if (!currData || !nextData) continue;
      const mismatches = allItems.filter(item => {
        const eveningClose = parseInt((currData.evening.stock[item.id]||{}).closing) || 0;
        const nextMorningOpen = parseInt((nextData.morning.stock[item.id]||{}).opening) || 0;
        return eveningClose !== nextMorningOpen && (eveningClose > 0 || nextMorningOpen > 0);
      }).map(item => {
        const eveningClose = parseInt((currData.evening.stock[item.id]||{}).closing) || 0;
        const nextMorningOpen = parseInt((nextData.morning.stock[item.id]||{}).opening) || 0;
        return { item, eveningClose, nextMorningOpen, diff: nextMorningOpen - eveningClose };
      });
      if (mismatches.length > 0) alerts.push({ fromDate: curr.date, fromDisplay: curr.dateDisplay, toDate: next.date, toDisplay: next.dateDisplay, mismatches });
    }
    if (sorted.length > 0) {
      const last = sorted[sorted.length - 1];
      if (last.date !== todayKey) {
        const lastData = getStockDataForDate(last.date);
        const todayData = { morning: { stock: morningStock, name: morningName }, evening: { stock: eveningStock, name: eveningName } };
        if (lastData) {
          const mismatches = allItems.filter(item => {
            const eveningClose = parseInt((lastData.evening.stock[item.id]||{}).closing) || 0;
            const nextMorningOpen = parseInt((todayData.morning.stock[item.id]||{}).opening) || 0;
            return eveningClose !== nextMorningOpen && (eveningClose > 0 || nextMorningOpen > 0);
          }).map(item => {
            const eveningClose = parseInt((lastData.evening.stock[item.id]||{}).closing) || 0;
            const nextMorningOpen = parseInt((todayData.morning.stock[item.id]||{}).opening) || 0;
            return { item, eveningClose, nextMorningOpen, diff: nextMorningOpen - eveningClose };
          });
          if (mismatches.length > 0) alerts.push({ fromDate: last.date, fromDisplay: last.dateDisplay, toDate: todayKey, toDisplay: "Today", mismatches });
        }
      }
    }
    return alerts.reverse();
  })();

  if (!itemsLoaded) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"#64748b", fontSize:15 }}>Loading from Firebase...</div>;
  }

  // ── Admin Dashboard ────────────────────────────────────────────────────
  if (adminMode) {

    const reportDetail = summaryDate ? (() => {
      const data = getStockDataForDate(summaryDate);
      const isToday = summaryDate === todayKey;
      const displayDate = isToday ? today : (inventoryHistory.find(e=>e.date===summaryDate)?.dateDisplay || summaryDate);
      if (!data) return null;
      const interMismatches = allItems.filter(item => {
        const mc = parseInt((data.morning.stock[item.id]||{}).closing) || 0;
        const eo = parseInt((data.evening.stock[item.id]||{}).opening) || 0;
        return mc !== eo && (mc > 0 || eo > 0);
      });
      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:500, display:"flex", alignItems:"center", justifyContent:"center", padding:"16px 10px" }}
          onClick={()=>{ setSummaryDate(null); setInterShiftOpen(false); }}>
          <div style={{ background:"#fff", borderRadius:18, width:"100%", maxWidth:620, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(0,0,0,0.4)" }}
            onClick={e=>e.stopPropagation()}>
            <div style={{ background:"#1a2340", borderRadius:"18px 18px 0 0", padding:"16px 20px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
              <button onClick={()=>{ setSummaryDate(null); setInterShiftOpen(false); }}
                style={{ width:44, height:44, borderRadius:12, border:"2px solid #334155", background:"#334155", color:"#fff", fontWeight:900, cursor:"pointer", fontSize:20, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>‹</button>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:900, color:"#fff", fontSize:15, lineHeight:1.2 }}>{displayDate}</div>
                <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>Shift Summary Report</div>
              </div>
              {!isToday && (
                <button onClick={()=>handleDeleteEntry(summaryDate, displayDate)}
                  style={{ padding:"8px 12px", borderRadius:9, border:"1px solid #7f1d1d", background:"#1c0a0a", color:"#fca5a5", fontWeight:700, cursor:"pointer", fontSize:12, flexShrink:0 }}>🗑</button>
              )}
            </div>

            <div style={{ padding:"16px 16px 20px" }}>
              {(() => {
                const shiftData = data.morning;
                const s = SHIFTS.morning;
                const cigVal = calcStockValue(shiftData.stock, "cigarettes");
                const alcVal = calcStockValue(shiftData.stock, "alcohol");
                const totalOpen = cigVal.opening + alcVal.opening;
                const totalClose = cigVal.closing + alcVal.closing;
                return (
                  <div style={{ marginBottom:12, borderRadius:14, overflow:"hidden", border:"1.5px solid #fde68a44" }}>
                    <div style={{ background:s.color, padding:"11px 14px", display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:20 }}>{s.icon}</span>
                      <div>
                        <div style={{ fontWeight:900, color:"#fff", fontSize:15 }}>{s.label}</div>
                        {shiftData.name && <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)", marginTop:1 }}>{shiftData.name}</div>}
                      </div>
                    </div>
                    <div style={{ background:"#fff" }}>
                      {[["🚬 Cigarettes", cigVal],["🍺 Alcohol", alcVal]].map(([label, val]) => (
                        <div key={label} style={{ padding:"10px 14px", borderBottom:"1px solid #f1f5f9" }}>
                          <div style={{ fontWeight:700, color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>{label}</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                            {[{l:"Opening Stock Value",v:val.opening},{l:"Closing Stock Value",v:val.closing},{l:"Stock Movement",v:val.opening-val.closing,color:(val.opening-val.closing)>=0?"#15803d":"#dc2626"}].map(({l,v,color})=>(
                              <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 6px", textAlign:"center", border:"1px solid #e2e8f0" }}>
                                <div style={{ fontSize:10, color:"#94a3b8", marginBottom:4, textTransform:"uppercase", lineHeight:1.3 }}>{l}</div>
                                <div style={{ fontWeight:800, color:color||"#1a2340", fontSize:14 }}>${v.toFixed(2)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div style={{ padding:"10px 14px", background:s.bg, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                        {[{l:"Total Opening Value",v:totalOpen},{l:"Total Closing Value",v:totalClose},{l:"Total Movement",v:totalOpen-totalClose}].map(({l,v})=>(
                          <div key={l} style={{ textAlign:"center" }}>
                            <div style={{ fontSize:10, color:s.accent, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:2, lineHeight:1.3 }}>{l}</div>
                            <div style={{ fontWeight:900, color:"#1a2340", fontSize:14 }}>${v.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const shiftData = data.evening;
                const s = SHIFTS.evening;
                const cigVal = calcStockValue(shiftData.stock, "cigarettes");
                const alcVal = calcStockValue(shiftData.stock, "alcohol");
                const totalOpen = cigVal.opening + alcVal.opening;
                const totalClose = cigVal.closing + alcVal.closing;
                return (
                  <div style={{ marginBottom:12, borderRadius:14, overflow:"hidden", border:"1.5px solid #bfdbfe44" }}>
                    <div style={{ background:s.color, padding:"11px 14px", display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:20 }}>{s.icon}</span>
                      <div>
                        <div style={{ fontWeight:900, color:"#fff", fontSize:15 }}>{s.label}</div>
                        {shiftData.name && <div style={{ fontSize:12, color:"rgba(255,255,255,0.75)", marginTop:1 }}>{shiftData.name}</div>}
                      </div>
                    </div>
                    <div style={{ background:"#fff" }}>
                      {[["🚬 Cigarettes", cigVal],["🍺 Alcohol", alcVal]].map(([label, val]) => (
                        <div key={label} style={{ padding:"10px 14px", borderBottom:"1px solid #f1f5f9" }}>
                          <div style={{ fontWeight:700, color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>{label}</div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                            {[{l:"Opening Stock Value",v:val.opening},{l:"Closing Stock Value",v:val.closing},{l:"Stock Movement",v:val.opening-val.closing,color:(val.opening-val.closing)>=0?"#15803d":"#dc2626"}].map(({l,v,color})=>(
                              <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 6px", textAlign:"center", border:"1px solid #e2e8f0" }}>
                                <div style={{ fontSize:10, color:"#94a3b8", marginBottom:4, textTransform:"uppercase", lineHeight:1.3 }}>{l}</div>
                                <div style={{ fontWeight:800, color:color||"#1a2340", fontSize:14 }}>${v.toFixed(2)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div style={{ padding:"10px 14px", background:s.bg, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                        {[{l:"Total Opening Value",v:totalOpen},{l:"Total Closing Value",v:totalClose},{l:"Total Movement",v:totalOpen-totalClose}].map(({l,v})=>(
                          <div key={l} style={{ textAlign:"center" }}>
                            <div style={{ fontSize:10, color:s.accent, textTransform:"uppercase", letterSpacing:"0.4px", marginBottom:2, lineHeight:1.3 }}>{l}</div>
                            <div style={{ fontWeight:900, color:"#1a2340", fontSize:14 }}>${v.toFixed(2)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {interMismatches.length > 0 ? (
                <div style={{ borderRadius:14, overflow:"hidden", border:"2px solid #dc2626" }}>
                  <button onClick={()=>setInterShiftOpen(o=>!o)}
                    style={{ width:"100%", background: interShiftOpen ? "#991b1b" : "#dc2626", border:"none", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, cursor:"pointer", textAlign:"left" }}>
                    <span style={{ fontSize:24, flexShrink:0 }}>⚠️</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:900, color:"#fff", fontSize:16 }}>Shift Handover Problem</div>
                      <div style={{ fontSize:13, color:"#fecaca", marginTop:3 }}>{interMismatches.length} item{interMismatches.length!==1?"s":""} did not match between shifts</div>
                      <div style={{ fontSize:12, color:"#fda4af", marginTop:3, fontWeight:600 }}>{interShiftOpen?"Tap to hide ▲":"Tap to see which items ▼"}</div>
                    </div>
                    <div style={{ background:"#fff", color:"#dc2626", fontWeight:900, fontSize:14, borderRadius:20, padding:"3px 11px", flexShrink:0 }}>{interMismatches.length}</div>
                  </button>
                  {interShiftOpen && (
                    <div style={{ background:"#fff7f7" }}>
                      <div style={{ padding:"12px 16px 6px", fontSize:13, color:"#991b1b", fontWeight:700 }}>Morning closing should match evening opening:</div>
                      {interMismatches.map((item, i) => {
                        const mc = parseInt((data.morning.stock[item.id]||{}).closing) || 0;
                        const eo = parseInt((data.evening.stock[item.id]||{}).opening) || 0;
                        const diff = eo - mc;
                        return (
                          <div key={item.id} style={{ margin:"0 12px 10px", borderRadius:10, background:"#fff", border:"1px solid #fecaca", padding:"10px 12px" }}>
                            <div style={{ fontWeight:800, color:"#1a2340", fontSize:14, marginBottom:8 }}>{item.name}</div>
                            <div style={{ display:"flex", gap:7 }}>
                              <div style={{ flex:1, background: diff!==0?"rgba(220,38,38,0.08)":"#fffbeb", borderRadius:8, padding:"8px 6px", textAlign:"center", border: diff!==0?"1.5px solid #fca5a5":"1px solid #fde68a" }}>
                                <div style={{ fontSize:10, color: diff!==0?"#991b1b":"#92400e", marginBottom:4, fontWeight:700 }}>Morning Closing Stock</div>
                                <div style={{ fontWeight:900, color: diff!==0?"#dc2626":"#b45309", fontSize:20 }}>{mc}</div>
                              </div>
                              <div style={{ flex:1, background: diff!==0?"rgba(220,38,38,0.08)":"#eff6ff", borderRadius:8, padding:"8px 6px", textAlign:"center", border: diff!==0?"1.5px solid #fca5a5":"1px solid #bfdbfe" }}>
                                <div style={{ fontSize:10, color: diff!==0?"#991b1b":"#1e40af", marginBottom:4, fontWeight:700 }}>Evening Opening Stock</div>
                                <div style={{ fontWeight:900, color: diff!==0?"#dc2626":"#1d4ed8", fontSize:20 }}>{eo}</div>
                              </div>
                              <div style={{ flex:1, background: diff!==0?"#fef2f2":"#f0fdf4", borderRadius:8, padding:"8px 6px", textAlign:"center", border:`1px solid ${diff!==0?"#fecaca":"#bbf7d0"}` }}>
                                <div style={{ fontSize:10, color:"#64748b", marginBottom:4 }}>Difference</div>
                                <div style={{ fontWeight:900, color: diff>0?"#b45309":"#dc2626", fontSize:20 }}>{diff>0?"+":""}{diff}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ padding:"10px 16px 14px", fontSize:12, color:"#991b1b", fontWeight:700 }}>Please check with the staff who worked these shifts.</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ borderRadius:12, background:"#f0fdf4", border:"1px solid #bbf7d0", padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>✅</span>
                  <div style={{ fontSize:14, color:"#15803d", fontWeight:700 }}>No shift handover problems for this day</div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    })() : null;

    return (
      <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:"#f1f5f9", minHeight:"100vh" }}>

        <div style={{ background:"#fff", borderBottom:"3px solid #1a2340", padding:"0 20px", display:"flex", alignItems:"stretch", minHeight:64, boxShadow:"0 2px 12px rgba(0,0,0,0.08)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14, flex:1, paddingTop:12, paddingBottom:12 }}>
            {adminScreen !== "dashboard" && (
              <button onClick={()=>{ setAdminScreen("dashboard"); setSummaryDate(null); setInterShiftOpen(false); }}
                style={{ width:48, height:48, borderRadius:12, border:"2.5px solid #1a2340", background:"#fff", color:"#1a2340", fontWeight:900, cursor:"pointer", fontSize:22, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 2px 8px rgba(0,0,0,0.10)" }}>‹</button>
            )}
            <div>
              <div style={{ fontSize:11, color:"#f59e0b", fontWeight:800, textTransform:"uppercase", letterSpacing:"1.5px" }}>🔓 ADMIN</div>
              <div style={{ fontSize:18, fontWeight:900, color:"#1a2340", lineHeight:1.1 }}>
                {adminScreen === "dashboard" && "Stock Tracker"}
                {adminScreen === "reports"   && "📊 Daily Reports"}
                {adminScreen === "alerts"    && "🔔 Alerts"}
                {adminScreen === "items"     && "⚙️ Manage Items"}
              </div>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, paddingTop:12, paddingBottom:12 }}>
            {syncStatus && <div style={{ fontSize:11, color:"#f59e0b", fontWeight:700 }}>{syncStatus}</div>}
          </div>
        </div>

        {adminScreen === "dashboard" && (
          <div style={{ padding:"24px 18px", maxWidth:520, margin:"0 auto" }}>
            <div style={{ marginBottom:22 }}>
              <div style={{ fontSize:22, fontWeight:900, color:"#1a2340", marginBottom:4 }}>Good day, Admin 👋</div>
              <div style={{ fontSize:13, color:"#64748b" }}>{today}</div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:24 }}>
              {[
                { screen:"reports", icon:"📊", title:"Daily Reports",          desc:"Morning & evening shift summaries by date",          border:"#1a234022", iconBg:"#eef0f8" },
                { screen:"alerts",  icon:"🔔", title:"Alerts & Discrepancies", desc: crossDayAlerts.length > 0 ? `${crossDayAlerts.length} overnight issue${crossDayAlerts.length!==1?"s":""} outstanding` : "No overnight issues outstanding", border: crossDayAlerts.length > 0 ? "#dc2626" : "#1a234022", iconBg: crossDayAlerts.length > 0 ? "#fef2f2" : "#eef0f8", badge: crossDayAlerts.length > 0 ? crossDayAlerts.length : null },
                { screen:"items",   icon:"⚙️", title:"Manage Items",           desc:"Add, remove products and edit prices",               border:"#1a234022", iconBg:"#eef0f8" },
              ].map(({screen, icon, title, desc, border, iconBg, badge}) => (
                <button key={screen} onClick={()=>setAdminScreen(screen)}
                  style={{ background:"#fff", border:`2px solid ${border}`, borderRadius:16, padding:"16px 18px", display:"flex", alignItems:"center", gap:14, cursor:"pointer", textAlign:"left", boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
                  <div style={{ width:52, height:52, borderRadius:14, background:iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, flexShrink:0 }}>{icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:800, color:"#1a2340", fontSize:16, marginBottom:3 }}>{title}</div>
                    <div style={{ fontSize:13, color:"#64748b", lineHeight:1.4 }}>{desc}</div>
                  </div>
                  {badge && <div style={{ background:"#dc2626", color:"#fff", fontWeight:900, fontSize:13, borderRadius:20, padding:"3px 11px", flexShrink:0 }}>{badge}</div>}
                  <span style={{ color:"#cbd5e1", fontSize:22, flexShrink:0 }}>›</span>
                </button>
              ))}
            </div>

            <div style={{ fontSize:11, color:"#94a3b8", fontWeight:700, textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>Quick Actions</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {[
                { label:saveFlash?"✓ Saved!":syncing?"Saving...":"💾 Save Today", onClick:handleSave, disabled:syncing, bg:saveFlash?"#15803d":"#1a2340" },
                { label:"📎 Export CSV", onClick:exportToCSV, bg:"#166534" },
                { label:"🔄 Refresh",    onClick:loadFromCloud, bg:"#475569" },
              ].map((btn,i) => (
                <button key={i} onClick={btn.onClick} disabled={btn.disabled}
                  style={{ flex:1, minWidth:"45%", padding:"12px 8px", borderRadius:10, border:"none", color:"#fff", fontWeight:700, cursor:btn.disabled?"not-allowed":"pointer", fontSize:12, background:btn.bg, opacity:btn.disabled?0.7:1 }}>
                  {btn.label}
                </button>
              ))}
              <button onClick={()=>{ setAdminMode(false); setAdminScreen("dashboard"); setSummaryDate(null); }}
                style={{ flex:1, minWidth:"45%", padding:"12px 8px", borderRadius:10, border:"2px solid #dc2626", color:"#dc2626", fontWeight:800, cursor:"pointer", fontSize:12, background:"#fff" }}>
                🔒 Exit Admin
              </button>
            </div>
          </div>
        )}

        {adminScreen === "reports" && (
          <div style={{ padding:"20px 18px", paddingBottom:40, maxWidth:520, margin:"0 auto" }}>
            <div style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>Tap a date to open the full shift report</div>

            <button onClick={()=>setSummaryDate(todayKey)}
              style={{ width:"100%", background:"#fff", border:"2px solid #1a2340", borderRadius:14, padding:"14px 16px", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", textAlign:"left", boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
              <div>
                <div style={{ fontWeight:800, color:"#1a2340", fontSize:15 }}>📅 Today — Live Data</div>
                <div style={{ fontSize:12, color:"#64748b", marginTop:3 }}>{today}</div>
              </div>
              <span style={{ color:"#1a2340", fontWeight:900, fontSize:24 }}>›</span>
            </button>

            {inventoryHistory.length === 0 ? (
              <div style={{ textAlign:"center", color:"#94a3b8", padding:30, fontSize:14 }}>No saved history yet</div>
            ) : inventoryHistory.map(entry => (
              <button key={entry.date} onClick={()=>setSummaryDate(entry.date)}
                style={{ width:"100%", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"13px 16px", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", textAlign:"left", boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
                <div>
                  <div style={{ fontWeight:700, color:"#1a2340", fontSize:14 }}>{entry.dateDisplay}</div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>Saved: {entry.savedAt}</div>
                </div>
                <span style={{ color:"#cbd5e1", fontWeight:900, fontSize:22 }}>›</span>
              </button>
            ))}

            {reportDetail}
          </div>
        )}

        {adminScreen === "alerts" && (() => {
          const visibleAlerts = crossDayAlerts.filter((_,idx) => !dismissedAlerts.has(idx));
          return (
          <div style={{ padding:"20px 18px", paddingBottom:40, maxWidth:520, margin:"0 auto" }}>
            <div style={{ fontSize:13, color:"#64748b", marginBottom:20, lineHeight:1.5 }}>
              These appear when a new day's opening count does not match the previous evening's closing count.
            </div>

            {visibleAlerts.length === 0 ? (
              <div style={{ borderRadius:16, background:"#fff", border:"1.5px solid #bbf7d0", padding:"36px 20px", textAlign:"center", boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize:44, marginBottom:14 }}>✅</div>
                <div style={{ fontSize:20, fontWeight:900, color:"#15803d", marginBottom:10 }}>No Alerts</div>
                <div style={{ fontSize:14, color:"#64748b", lineHeight:1.6 }}>
                  {crossDayAlerts.length > 0
                    ? `All ${crossDayAlerts.length} alert${crossDayAlerts.length!==1?"s":""} have been dismissed.`
                    : "All evening closing counts matched the next morning's opening counts."}
                </div>
              </div>
            ) : visibleAlerts.map((alert, visIdx) => {
              const origIdx = crossDayAlerts.indexOf(alert);
              return (
              <div key={visIdx} style={{ marginBottom:16, borderRadius:16, overflow:"hidden", border:"2px solid #fca5a5", background:"#fff", boxShadow:"0 2px 10px rgba(220,38,38,0.10)" }}>
                <div style={{ background:"#991b1b", padding:"13px 16px", display:"flex", alignItems:"flex-start", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:900, color:"#fff", fontSize:15 }}>⚠️ Overnight Discrepancy</div>
                    <div style={{ fontSize:13, color:"#fecaca", marginTop:4 }}>
                      Evening of <strong style={{ color:"#fff" }}>{alert.fromDisplay}</strong> → Morning of <strong style={{ color:"#fff" }}>{alert.toDisplay}</strong>
                    </div>
                    <div style={{ fontSize:12, color:"#fda4af", marginTop:3 }}>{alert.mismatches.length} item{alert.mismatches.length!==1?"s":""} with mismatched counts</div>
                  </div>
                </div>
                {alert.mismatches.map((m, i) => (
                  <div key={m.item.id} style={{ margin:"10px 12px", borderRadius:12, background:"#fff7f7", border:"1px solid #fecaca", padding:"12px 14px" }}>
                    <div style={{ fontWeight:800, color:"#1a2340", fontSize:14, marginBottom:8 }}>{m.item.name}</div>
                    <div style={{ display:"flex", gap:7 }}>
                      <div style={{ flex:1, background:"#eff6ff", borderRadius:8, padding:"9px 6px", textAlign:"center", border:"1px solid #bfdbfe" }}>
                        <div style={{ fontSize:10, color:"#1e40af", marginBottom:4, fontWeight:600 }}>Evening Closing Stock</div>
                        <div style={{ fontWeight:900, color:"#1d4ed8", fontSize:22 }}>{m.eveningClose}</div>
                      </div>
                      <div style={{ flex:1, background:"#fffbeb", borderRadius:8, padding:"9px 6px", textAlign:"center", border:"1px solid #fde68a" }}>
                        <div style={{ fontSize:10, color:"#92400e", marginBottom:4, fontWeight:600 }}>Next Morning Opening Stock</div>
                        <div style={{ fontWeight:900, color:"#b45309", fontSize:22 }}>{m.nextMorningOpen}</div>
                      </div>
                      <div style={{ flex:1, background:"#fef2f2", borderRadius:8, padding:"9px 6px", textAlign:"center", border:"1px solid #fecaca" }}>
                        <div style={{ fontSize:10, color:"#64748b", marginBottom:4, fontWeight:600 }}>Difference</div>
                        <div style={{ fontWeight:900, color: m.diff>0?"#b45309":"#dc2626", fontSize:22 }}>{m.diff>0?"+":""}{m.diff}</div>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ padding:"12px 16px 14px", borderTop:"1px solid #fecaca", display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ flex:1, fontSize:12, color:"#991b1b", fontWeight:600, lineHeight:1.5 }}>
                    Please check with staff who closed on {alert.fromDisplay} and opened on {alert.toDisplay}.
                  </div>
                  <button
                    onClick={()=>setDismissedAlerts(prev => new Set([...prev, origIdx]))}
                    style={{ flexShrink:0, padding:"10px 16px", borderRadius:10, border:"1.5px solid #991b1b", background:"#fff", color:"#991b1b", fontWeight:800, cursor:"pointer", fontSize:13, whiteSpace:"nowrap" }}>
                    ✓ Dismiss
                  </button>
                </div>
              </div>
              );
            })}
          </div>
          );
        })()}

        {adminScreen === "items" && (
          <div style={{ padding:"20px 18px", paddingBottom:40, maxWidth:520, margin:"0 auto" }}>

            <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:16, padding:18, marginBottom:22, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight:800, color:"#1a2340", fontSize:15, marginBottom:14 }}>➕ Add New Item</div>
              <input value={newItemName} onChange={e=>setNewItemName(e.target.value)}
                placeholder="Item name (e.g. Heineken)"
                style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:15, outline:"none", background:"#f8fafc", color:"#1a2340", boxSizing:"border-box", marginBottom:10 }} />
              <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                <input type="number" step="0.01" value={newItemPrice} onChange={e=>setNewItemPrice(e.target.value)}
                  placeholder="Price $"
                  style={{ flex:1, padding:"12px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:15, outline:"none", background:"#f8fafc", color:"#1a2340" }} />
                <select value={newItemCategory} onChange={e=>setNewItemCategory(e.target.value)}
                  style={{ flex:1, padding:"12px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:14, background:"#f8fafc", color:"#1a2340" }}>
                  <option value="cigarettes">🚬 Cigarettes</option>
                  <option value="alcohol">🍺 Alcohol</option>
                </select>
              </div>
              <button onClick={handleAddItem} disabled={itemSaving}
                style={{ width:"100%", padding:13, borderRadius:10, border:"none", background:"#1a2340", color:"#fff", fontWeight:800, cursor:"pointer", fontSize:15 }}>
                {itemSaving ? "Saving..." : "Add Item"}
              </button>
              {itemMsg && <div style={{ marginTop:12, fontSize:14, color: itemMsg.startsWith("✅")?"#15803d":"#dc2626", fontWeight:700 }}>{itemMsg}</div>}
            </div>

            {["cigarettes","alcohol"].map(cat => (
              <div key={cat} style={{ marginBottom:22 }}>
                <div style={{ fontWeight:800, color:"#1a2340", fontSize:15, marginBottom:10 }}>
                  {cat==="cigarettes"?"🚬 Cigarettes":"🍺 Alcohol"}
                  <span style={{ color:"#94a3b8", fontWeight:600, fontSize:13, marginLeft:6 }}>({(items[cat]||[]).length} items)</span>
                </div>
                {(items[cat]||[]).map(item => (
                  <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius:12, background:"#fff", border:"1.5px solid #e2e8f0", marginBottom:8, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div>
                      <div style={{ fontWeight:700, color:"#1a2340", fontSize:14 }}>{item.name}</div>
                      {editingPrice===item.id ? (
                        <input type="number" step="0.01" value={tempPrice}
                          onChange={e=>setTempPrice(e.target.value)}
                          onBlur={()=>commitPrice(item.id)}
                          onKeyDown={e=>e.key==="Enter"&&commitPrice(item.id)}
                          style={{ width:80, padding:"4px 8px", border:"2px solid #1a2340", borderRadius:7, textAlign:"center", fontSize:14, fontWeight:700, marginTop:4, background:"#f8fafc" }} autoFocus />
                      ) : (
                        <span onClick={()=>{ setEditingPrice(item.id); setTempPrice(String(item.price)); }}
                          style={{ fontSize:13, color:"#2563eb", fontWeight:700, cursor:"pointer", marginTop:4, display:"inline-block", borderBottom:"1px dashed #2563eb" }}>${item.price.toFixed(2)} — tap to edit</span>
                      )}
                    </div>
                    <button onClick={()=>handleRemoveItem(cat, item.id, item.name)} disabled={itemSaving}
                      style={{ padding:"9px 14px", borderRadius:9, border:"1.5px solid #fca5a5", background:"#fff1f2", color:"#b91c1c", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <Modal show={showAdminModal} onClose={()=>{setShowAdminModal(false);setPwInput("");setPwError(false);}} title="🔐 Admin Login">
          <input type="password" value={pwInput} onChange={e=>{setPwInput(e.target.value);setPwError(false);}}
            onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} placeholder="Enter admin password"
            style={{ width:"100%", padding:"10px 14px", border:`2px solid ${pwError?"#ef4444":"#e2e8f0"}`, borderRadius:8, fontSize:15, boxSizing:"border-box", outline:"none", marginBottom:8 }} />
          {pwError && <div style={{ color:"#ef4444", fontSize:12, marginBottom:10 }}>Incorrect password</div>}
          <button onClick={handleAdminLogin} style={{ width:"100%", padding:11, borderRadius:8, border:"none", background:"#1a2340", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:14 }}>Login</button>
        </Modal>
      </div>
    );
  }

  // ── Staff view ──────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:"#eef0f8", minHeight:"100vh", paddingBottom:40 }}>

      <div style={{ background:"#1a2340", color:"#fff", padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>📦 Stock Tracker</div>
          <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{today}</div>
          {inventoryHistory.length>0 && <div style={{ fontSize:11, color:"#4ade80", marginTop:2 }}>📅 {inventoryHistory.length} days in Firebase</div>}
          {syncStatus && <div style={{ fontSize:11, color:"#fbbf24", marginTop:2 }}>{syncStatus}</div>}
        </div>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          {[
            { label:saveFlash?"✓ Saved!":syncing?"Saving...":"💾 Save", onClick:handleSave, disabled:syncing, bg:saveFlash?"#15803d":syncing?"#64748b":"#2563eb" },
            { label:"🔄 Refresh", onClick:loadFromCloud, bg:"#b45309" },
            { label:`📜 History (${inventoryHistory.length})`, onClick:()=>setShowHistory(true), bg:"#7e22ce" },
            { label:"🔐 Admin", onClick:()=>setShowAdminModal(true), bg:"#5b21b6" },
          ].filter(Boolean).map((btn,i) => (
            <button key={i} onClick={btn.onClick} disabled={btn.disabled}
              style={{ padding:"7px 12px", borderRadius:7, border:"none", color:"#fff", fontWeight:700, cursor:btn.disabled?"not-allowed":"pointer", fontSize:12, background:btn.bg, opacity:btn.disabled?0.7:1 }}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:"flex", padding:"12px 16px 0" }}>
        {Object.entries(SHIFTS).map(([key,s]) => (
          <button key={key} onClick={()=>setActiveShift(key)}
            style={{ flex:1, padding:"10px 8px", border:"none", cursor:"pointer", fontWeight:700, fontSize:13, borderRadius:key==="morning"?"9px 0 0 9px":"0 9px 9px 0", background:activeShift===key?s.color:"#dde1ee", color:activeShift===key?"#fff":"#64748b" }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div style={{ padding:"12px 16px 0" }}>
        <input value={activeShift==="morning"?morningName:eveningName}
          onChange={e=>(activeShift==="morning"?setMorningName:setEveningName)(e.target.value)}
          placeholder={`${SHIFTS[activeShift].label} employee name...`}
          style={{ width:"100%", padding:"9px 13px", border:`2px solid ${shift.accent}55`, borderRadius:8, fontSize:14, fontWeight:600, background:shift.bg, color:"#1a2340", boxSizing:"border-box", outline:"none" }} />
      </div>

      <div style={{ display:"flex", padding:"12px 16px 0" }}>
        {[{key:"cigarettes",label:"🚬 Cigarettes"},{key:"alcohol",label:"🍺 Alcohol"}].map(({key,label}) => (
          <button key={key} onClick={()=>setActiveTab(key)}
            style={{ flex:1, padding:"9px 8px", border:"none", cursor:"pointer", fontWeight:700, fontSize:13, borderRadius:key==="cigarettes"?"8px 0 0 8px":"0 8px 8px 0", background:activeTab===key?shift.accent:"#dde1ee", color:activeTab===key?"#fff":"#64748b" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding:"12px 16px 0" }}>{renderTable(activeTab)}</div>

      <div style={{ padding:"10px 16px 0", textAlign:"right" }}>
        <button onClick={()=>handleReset(activeShift)} style={{ padding:"7px 14px", borderRadius:7, border:"1px solid #fca5a5", background:"#fff1f2", color:"#b91c1c", fontWeight:700, cursor:"pointer", fontSize:12 }}>
          🗑 Reset {SHIFTS[activeShift].label}
        </button>
      </div>

      <Modal show={showHistory} onClose={()=>setShowHistory(false)} title={`📜 Sales History (${inventoryHistory.length} days)`} wide>
        {inventoryHistory.length === 0 ? (
          <div style={{ textAlign:"center", color:"#94a3b8", padding:30 }}>No history saved yet.</div>
        ) : inventoryHistory.map(entry => {
          const dayCigSold = ["morning","evening"].reduce((t,sk)=>t+(entry[sk]?.cigTotals?.sold||0),0);
          const dayAlcSold = ["morning","evening"].reduce((t,sk)=>t+(entry[sk]?.alcTotals?.sold||0),0);
          const dayCigVal  = ["morning","evening"].reduce((t,sk)=>t+(entry[sk]?.cigTotals?.value||0),0);
          const dayAlcVal  = ["morning","evening"].reduce((t,sk)=>t+(entry[sk]?.alcTotals?.value||0),0);
          const dayTotal   = dayCigVal + dayAlcVal;
          return (
            <div key={entry.date} style={{ marginBottom:14, borderRadius:12, overflow:"hidden", border:"1px solid #e2e8f0" }}>
              <div style={{ background:"#1a2340", padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontWeight:800, color:"#fff", fontSize:14 }}>{entry.dateDisplay}</div>
                <div style={{ fontSize:11, color:"#94a3b8" }}>{entry.savedAt}</div>
              </div>
              {["morning","evening"].map(shiftKey => {
                const sd = entry[shiftKey];
                const s = SHIFTS[shiftKey];
                return (
                  <div key={shiftKey} style={{ padding:"10px 14px", borderBottom:"1px solid #f1f5f9", background: shiftKey==="morning"?"#fffbf5":"#f5f8ff" }}>
                    <div style={{ fontWeight:700, color:s.color, fontSize:13, marginBottom:8 }}>{s.icon} {s.label} {sd.employeeName ? `— ${sd.employeeName}` : ""}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div style={{ background:"#fff", borderRadius:8, padding:"8px 10px", border:"1px solid #e2e8f0", textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#64748b", marginBottom:3, textTransform:"uppercase" }}>🚬 Cigarettes</div>
                        <div style={{ fontWeight:800, color:"#1a2340", fontSize:14 }}>{sd.cigTotals?.sold||0} sold</div>
                        <div style={{ fontWeight:700, color:"#15803d", fontSize:12 }}>${(sd.cigTotals?.value||0).toFixed(2)}</div>
                      </div>
                      <div style={{ background:"#fff", borderRadius:8, padding:"8px 10px", border:"1px solid #e2e8f0", textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#64748b", marginBottom:3, textTransform:"uppercase" }}>🍺 Alcohol</div>
                        <div style={{ fontWeight:800, color:"#1a2340", fontSize:14 }}>{sd.alcTotals?.sold||0} sold</div>
                        <div style={{ fontWeight:700, color:"#15803d", fontSize:12 }}>${(sd.alcTotals?.value||0).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ padding:"10px 14px", background:"#f8fafc", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:12, color:"#64748b" }}>🚬 {dayCigSold} · 🍺 {dayAlcSold} items sold</div>
                <div style={{ fontWeight:900, color:"#1a2340", fontSize:15 }}>💰 ${dayTotal.toFixed(2)}</div>
              </div>
            </div>
          );
        })}
      </Modal>

      <Modal show={showAdminModal} onClose={()=>{setShowAdminModal(false);setPwInput("");setPwError(false);}} title="🔐 Admin Login">
        <input type="password" value={pwInput} onChange={e=>{setPwInput(e.target.value);setPwError(false);}}
          onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} placeholder="Enter admin password"
          style={{ width:"100%", padding:"10px 14px", border:`2px solid ${pwError?"#ef4444":"#e2e8f0"}`, borderRadius:8, fontSize:15, boxSizing:"border-box", outline:"none", marginBottom:8 }} />
        {pwError && <div style={{ color:"#ef4444", fontSize:12, marginBottom:10 }}>Incorrect password</div>}
        <button onClick={handleAdminLogin} style={{ width:"100%", padding:11, borderRadius:8, border:"none", background:"#1a2340", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:14 }}>Login</button>
      </Modal>
    </div>
  );
}

export default App;
