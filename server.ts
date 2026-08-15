import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import zlib from "zlib";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Resolve paths
const KEYS_FILE = path.join(process.cwd(), "keys.json");
const TMP_KEYS_FILE = path.join("/tmp", "keys.json");
const VERIFIED_DEVICES_FILE = path.join(process.cwd(), "verified_devices.json");

function getKeysFilePath() {
  if (process.env.KEYS_FILE_PATH) {
    return process.env.KEYS_FILE_PATH;
  }
  // Automatic detection of Render/Docker persistent disks mounted at /data
  if (fs.existsSync("/data") && !process.env.VERCEL) {
    return "/data/keys.json";
  }
  if (process.env.VERCEL && fs.existsSync(TMP_KEYS_FILE)) {
    return TMP_KEYS_FILE;
  }
  return KEYS_FILE;
}

const MAX_CASH = Number.MAX_SAFE_INTEGER;
const MAX_GOLD = Number.MAX_SAFE_INTEGER;
const MAX_EXP = 93060;

function calculateLevelFromExp(exp: number): number {
  if (exp <= 0) return 1;
  if (exp >= 93060) return 50;
  // Quadratic progression formula: Level = Math.floor(Math.sqrt(exp / 37.224))
  const lvl = Math.floor(Math.sqrt(exp / 37.224));
  return Math.max(1, Math.min(50, lvl));
}

function getKeyCredits(keyData: { credits?: number; tokens?: number } | null | undefined): number {
  if (keyData?.credits !== undefined) return keyData.credits;
  if (keyData?.tokens !== undefined) return keyData.tokens;
  return 10;
}

function resolveCreditsFromBody(body: Record<string, unknown>): number | undefined {
  const raw = body.credits !== undefined ? body.credits : body.tokens;
  if (raw === undefined) return undefined;
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? undefined : n;
}

function creditResponse(credits: number) {
  return { credits };
}

function isOutOfCredits(keyData: { out_of_credits?: boolean; out_of_tokens?: boolean } | null | undefined): boolean {
  return !!(keyData?.out_of_credits || keyData?.out_of_tokens);
}

function parseResourceValue(
  value: unknown,
  min: number,
  max: number,
  label: string
): { ok: boolean; value: number | null; message: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null, message: "" };
  }
  if (value === 0 || value === "0") {
    return { ok: true, value: null, message: "" };
  }
  const n = typeof value === "number" ? value : parseInt(String(value), 10);

  if (label === "cash" || label === "gold") {
    if (Number.isNaN(n) || n < 0) {
      return { ok: false, value: null, message: `Invalid ${label}: must be a non-negative number.` };
    }
    // Auto-lock values above 2.14B to 2.14B to prevent overflow/resets
    if (n > 2140000000) {
      return { ok: true, value: 2140000000, message: "" };
    }
  } else {
    if (Number.isNaN(n) || n < min) {
      return { ok: false, value: null, message: `Invalid ${label}: must be between ${min} and ${max}, or 0 to skip.` };
    }
    if (n > max) {
      return { ok: true, value: max, message: "" };
    }
  }
  return { ok: true, value: n, message: "" };
}

// Helper to save keys database to CSV (Excel compatible) format
function saveKeysToCsv(cleanDb: any) {
  try {
    const jsonPath = getKeysFilePath();
    const csvPath = jsonPath.replace(/\.json$/, ".csv");

    const headers = ["License Key", "Role", "Credits", "Created At", "Max Claims", "Enabled Features", "Status"];
    const rows = [headers.join(",")];

    for (const [key, data] of Object.entries(cleanDb.keys || {})) {
      const keyData = data as any;
      const features = (keyData.enabled_features || []).join(";");
      const status = isOutOfCredits(keyData) ? "Out of Credits" : "Active";
      const row = [
        key,
        keyData.role || "user",
        getKeyCredits(keyData),
        keyData.created_at || "",
        keyData.max_claims !== undefined ? keyData.max_claims : 1,
        `"${features}"`,
        status
      ];
      rows.push(row.join(","));
    }

    fs.writeFileSync(csvPath, rows.join("\n"), "utf-8");
    console.log(`[KEYS] Excel-compatible CSV backup successfully written to: ${csvPath}`);
  } catch (err) {
    console.error("[KEYS CSV ERROR] Failed to write keys CSV backup:", err);
  }
}

// Default Owner Key & Constants
const OWNER_KEY = process.env.OWNER_KEY || "admin-mingfu";
const BASE_URL = "https://carx-id-prod.carx-online.com/api/auth";
const GAME_BASE_URL = "https://street-prod.carx-online.com/str/v1/client";

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "CarXStreet/1.20.0 (Android; 13)",
  "Accept": "application/json",
  "X-Unity-Version": "2021.3.16f1",
  "X-App-Version": "1.20.0",
  "Connection": "Keep-Alive",
  "X-Project-Id": "4",
  "X-Identity-Project-Id": "4"
};

const STREETPASS_BODY = JSON.stringify({
  gameVersion: "1.20.0",
  purchaseId: "GPA.3304-3406-9941-41674",
  productId: "com.carxtech.sr.bank.event.bp",
  transactionData: "naooopliblhmhlhjphaiblip.AO-J1Owuw7bYU69mo6A_woU7wHx6NDEZPS_Io-HzmDgWudqOLG_3tEEwEqMihq1eHZlasQ97qUvkuma4CCPraosxDFlQEKipqw",
  transactionId: "naooopliblhmhlhjphaiblip.AO-J1Owuw7bYU69mo6A_woU7wHx6NDEZPS_Io-HzmDgWudqOLG_3tEEwEqMihq1eHZlasQ97qUvkuma4CCPraosxDFlQEKipqw",
  subscription: false,
  metaInfo: JSON.stringify({
    json: JSON.stringify({
      packageName: "com.carxtech.sr",
      productId: "com.carxtech.sr.bank.event.bp",
      purchaseTime: 1776223964504,
      purchaseState: 0,
      purchaseToken: "naooopliblhmhlhjphaiblip.AO-J1Owuw7bYU69mo6A_woU7wHx6NDEZPS_Io-HzmDgWudqOLG_3tEEwEqMihq1eHZlasQ97qUvkuma4CCPraosxDFlQEKipqw",
      quantity: 1,
      acknowledged: false,
      orderId: "GPA.3304-3406-9941-41674"
    }),
    signature: "fAlvYHDSE9y+tbPxNYtpI97ompnSrfSkR3AerW5pAatwNtihN6jOb8eXYvLCQxAyc7sK/jU87m9hz6Co4Vig3OvIh74bPm2Z+1y8oGcNNUvyIpQlqV85j4x2PFzbFU0//TCraeAfJOn2mOlHZqMqQ1Fpb2oh1wN6PhMtkQt56Pcg/J6gEpBhhVuU31Om02lW17oj3phKx4KXMbcgvqQ81gLhdos82BKSD7u/VPsnJevKEu5cGC273dh0AmxUUJPRVryeg+ucln6jJLgL+qmH1F71qb7IZ0duAkX3usw/rYY7Luhg0puo9NjW/xt+dblckah5adr/IrL3f1cpfe/xfQ==",
    skuDetails: [
      JSON.stringify({
        productId: "com.carxtech.sr.bank.event.bp",
        type: "inapp",
        title: "Street Pass (CarX Street)",
        name: "Street Pass",
        description: "Street Pass",
        price: "Rp\u00a099.000",
        price_amount_micros: 99000000000,
        price_currency_code: "IDR"
      })
    ]
  }),
  marketType: "GOOGLE",
  productType: 0
});

// All 189 Car Model IDs matching the python bot
export const ALL_CAR_MODELS = [
  "toyotasupra2020", "bmwm3e46", "bmwm3e30", "bmwm3e36", "bmwe30", "bmw340i",
  "bmwm240i", "bmw2002", "bmw1m", "bmwm4", "bmwm2", "bmwm5e60", "bmwm5e34",
  "bmwm6", "bmw760li", "bmwe46", "bmw3series", "bmw5series", "toyotaae86",
  "toyotacelica", "toyotamr2", "toyotamarkii", "toyotalandcruiser200",
  "toyotaav4", "toyotatundra", "toyotacamry", "toyotacorolla", "toyotacorollagts",
  "toyotagr86", "toyotagrb", "toyotasupraa70", "toyotasupraa80", "toyotayaris",
  "nissangtr", "nissangtr35", "nissan240sx", "nissan350z", "nissan370z",
  "nissansilvia", "nissan180sx", "nissanskyline", "nissanskylinegtr",
  "nissangtrs15", "nissangtrs14", "nissanpatrol", "nissanfrontier",
  "nissanfairladyz31", "nissanfairladyz32", "nissanfairladyz33",
  "hondacivic", "hondaaccord", "hondacrx", "hondaintegra", "hondansx",
  "hondas2000", "hondacr-v", "hondafit", "hondaprelude",
  "mazdamiata", "mazdamx5", "mazdamx6", "mazdarx7", "mazdarx8",
  "mazda6", "mazda3", "mazdaatenza", "mazdabt50",
  "mitsubishieclipse", "mitsubishievo9", "mitsubishievo10", "mitsubishigto",
  "mitsubishilancer", "mitsubishimontero", "mitsubishioutlander", "mitsubishil200",
  "subaruimpreza", "subaruimprezawrxsti", "subarulegacy", "subaruoutback",
  "subaruforester", "subarubrz", "subarutribeca",
  "audiа4", "audi80", "audirs4", "audirs6", "audirs7", "auditt", "audis3",
  "audis4", "audis5", "audis6", "audis8", "audia3", "audia6", "audia8",
  "audiq7", "audiq8", "audiR8",
  "mercedesbenzc63", "mercedesbenzcla", "mercedesbenzclk", "mercedesbenzcls",
  "mercedesbenzsl", "mercedesbenzsls", "mercedesbenzsslk", "mercedesbenzamg",
  "mercedesbenze55", "mercedesbenze63", "mercedesbenzeclass",
  "porsche911", "porsche911gt3", "porsche911turbo", "porsche918", "porscheboxter",
  "porschecayman", "porschepanamera", "porschecarreragts",
  "chevroletcamaro", "chevroletcorvette", "chevroletcorvettezo6",
  "chevroletcorvettezt1", "chevroletsilverado", "chevroleteq",
  "fordmustang", "fordmustanggt500", "fordgt", "fordf150", "fordf250",
  "fordfusion", "fordtaurus",
  "dodgechallenger", "dodgechargersrt", "dodgecharger", "dodgeviper",
  "dodgedurango", "dodgeram1500",
  "jeepwrangler", "jeepgrandcherokee", "jeeprenegade",
  "lamborghiniavantador", "lamborghinihuracan", "lamborghiniuruss",
  "lamborghinimurcielago", "lamborghinijalpa",
  "ferrariroma", "ferrari488", "ferrari458", "ferrari430", "ferrari360",
  "ferrari812", "ferrariportofino", "ferrarif8", "ferrarif40", "ferrarif50",
  "mclarensenna", "mclaren720s", "mclaren570s", "mclaren600lt",
  "paganihuayra", "paganizonda",
  "bugattichironss", "bugattichiron", "bugattichiropureblee", "bugattiveyron",
  "koenigseggone1", "koenigseggageras", "koenigseggccr",
  "rollsroycephantom", "rollsroycecullinan", "rollsroyceghost",
  "bentleycontinentalgt", "bentleybentayga",
  "astonmartindb11", "astonmartinvantage", "astonmartindbs",
  "maseratigranturismo", "maseratileventegts",
  "alfaaguilajuliet", "alfastelvio", "alfa156", "alfa159",
  "volkswagengolf4", "volkswagenpassat", "volkswagenscirocco",
  "volkswagentiguan", "volkswagenid4",
  "renaultsportmegane", "renaultsportclio", "renaultkoleos",
  "peugeot207", "peugeot206", "peugeot508", "peugeot3008",
  "citroenax", "citroenc4", "citroenxsara",
  "seatleoncupra", "seatibiza", "seatleon",
  "skodaoctaviars", "skodakodiaq",
  "hyundaiveloster", "hyundaigenesis", "hyundaicoupetib", "hyundaicelantra",
  "kiagts", "kiastinger", "kiaoptima", "kiasorento",
  "lexusisf", "lexusis300", "lexusis200", "lexuslc500", "lexuslx",
  "infinitiq50", "infinitifx", "infinitig35",
  "acuratsx", "acuransx", "acurardx"
];
export const ALL_CAR_MODEL_IDS = ALL_CAR_MODELS;

// COMPLETE REAL ESTATE DATA (52 properties from the game)
export const REAL_ESTATE_PROPERTIES = [
  "apartment_01", "apartment_51", "apartment_95",
  "apartment_industrial_SP", "apartment_midtown_SP", "apartment_midtown2_SP", "apartment_midtown3_SP",
  "Industrial_apartment_1", "Industrial_apartment_2", "Industrial_apartment_3", "Industrial_apartment_4", "Industrial_apartment_5", "Industrial_apartment_6",
  "Midtown_apartment_1", "Midtown_apartment_2", "Midtown_apartment_3", "Midtown_apartment_4", "Midtown_apartment_5", "Midtown_apartment_6",
  "Midtown_apartment_7", "Midtown_apartment_8", "Midtown_apartment_9", "Midtown_apartment_10", "Midtown_apartment_11", "Midtown_apartment_12",
  "Prigorod_apartment_1", "Prigorod_apartment_2", "Prigorod_apartment_3", "Prigorod_apartment_4", "Prigorod_apartment_5", "Prigorod_apartment_6", "Prigorod_apartment_7",
  "Mountain_apartment_1", "Mountain_apartment_2", "Mountain_apartment_3", "Mountain_apartment_4", "Mountain_apartment_5", "Mountain_apartment_6",
  "Mountain_apartment_7", "Mountain_apartment_8", "Mountain_apartment_9", "Mountain_apartment_11", "Mountain_apartment_13", "Mountain_apartment_14",
  "Mountain_apartment_15", "Mountain_apartment_16", "Mountain_apartment_17", "Mountain_apartment_18", "Mountain_apartment_19",
  "Speedway_apartment_1", "Speedway_apartment_2", "Speedway_apartment_3"
];

export const EXTRA_LOCATION_KEYS = ["car_market_0", "car_showroom_0", "car_showroom_1", "car_showroom_2"];

export const CAR_KITS: Record<string, string[]> = {
  ae86: ['stock', 'rnt'],
  audir8: ['stock', 'rnt'],
  audirs6avantc7: ['stock', 'rnt'],
  audirs7: ['stock', 'rnt'],
  bmw_i8: ['stock', 'slideperformance'],
  bmw_m3_e36: ['stock', 'missile'],
  bmw_m3_e92_cabrio: ['stock', 'rnt'],
  bmw_z4_e86: ['stock', 'rnt'],
  bmwe30m3: ['stock', 'rnt'],
  bmwe31: ['stock', 'rnt'],
  bmwe46m3: ['stock', 'proflow'],
  bmwm2g87: ['stock', 'streetx'],
  bmwm3g81_touring: ['stock', 'streetx'],
  bmwm4: ['stock', 'dmaster'],
  bmwm4g82: ['stock', 'streetx'],
  bmwm5e34: ['stock', 'missile'],
  bmwm5e39_vagon: ['stock', 'streetx'],
  bmwm5e60: ['stock', 'missile'],
  bmwm5f90: ['stock', 'cbw'],
  bmwm5x5: ['stock', 'rnt'],
  bmwm6e24: ['stock', 'streetx'],
  charger: ['stock', 'cbw'],
  chevroletcamaro2016: ['stock', 'rnt'],
  chevroletchevelless1970: ['stock', 'streetx'],
  chevycamaro70: ['stock', 'cbw'],
  civic: ['stock'],
  civicek9: ['stock', 'slideperformance'],
  corvettec3: ['stock', 'streetx'],
  corvettec6: ['stock', 'missile'],
  corvettec7: ['stock', 'dmaster'],
  dodgechallengerrt: ['stock', 'missile'],
  dodgecharger2020: ['stock', 'streetx'],
  ferrarif40: ['stock', 'rnt'],
  fordfocusst2019: ['stock', 'streetx'],
  fordgt_mk2: ['stock', 'cbw'],
  golfgti: ['stock', 'streetx'],
  hondas2000: ['stock'],
  hotrod: ['stock'],
  infinity_q60: ['stock', 'dmaster'],
  jaguar_ftype: ['stock', 'rnt'],
  lamborghiniaventadors: ['stock', 'rnt', 'dmaster'],
  lamborghinidiablo: ['stock', 'rnt'],
  lamborghinievo: ['stock', 'dmaster'],
  lexuslfa: ['stock', 'rnt'],
  lexusrcf: ['stock', 'rnt'],
  lotuselise: ['stock', 'streetx'],
  maloor82015: ['stock', 'cbw'],
  mazdarx7: ['stock', 'rnt'],
  mazdarx7_fc: ['stock', 'cbw'],
  mazdarx8: ['stock', 'rnt'],
  mbgelandewagenw463: ['stock'],
  mclaren720s: ['stock', 'cbw'],
  mercedesbenz190evo2: ['stock', 'rnt'],
  mercedesbenzamggt2019: ['stock', 'streetx'],
  mitsubishievo6: ['stock', 'rnt'],
  mitsubishievo9: ['stock', 'streetx'],
  mitsubishievox: ['stock', 'rnt'],
  mustang350: ['stock', 'streetx'],
  mustang650: ['stock', 'streetx'],
  mustang_hoonigan: ['stock'],
  nissan180sx: ['stock', 'slideperformance'],
  nissan300zx: ['stock', 'cbw'],
  nissan300zx_cabrio: ['stock', 'streetx'],
  nissan350z: ['stock', 'cbw'],
  nissan400z: ['stock', 'proflow'],
  nissansilvias13: ['stock', 'missile'],
  nissanskyline2000gtx: ['stock', 'cbw'],
  nissanskyliner33vspec: ['stock', 'rnt'],
  nissanz31: ['stock', 'cbw'],
  porsche911: ['stock', 'dmaster'],
  porsche911gt3: ['stock', 'rnt'],
  porschesinger: ['stock', 'sharknose'],
  silvias15: ['stock', 'proflow'],
  skyliner32: ['stock', 'cbw'],
  skyliner34: ['stock', 'dmaster'],
  skyliner35: ['stock', 'streetx'],
  subaruwrxsti: ['stock', 'dmaster'],
  suzukicarry: ['stock', 'streetx'],
  tesla_s_plaid: ['stock', 'cbw'],
  toyotagr86: ['stock', 'rnt', 'dmaster'],
  toyotagt86: ['stock', 'rnt'],
  toyotamark2_100: ['stock', 'rnt'],
  toyotasupra2020: ['stock', 'rnt', 'streetx'],
  toyotasupraa70: ['stock', 'streetx'],
  toyotasuprarz: ['stock', 'cbw'],
  toyotayarisgr2020: ['stock'],
  van: ['stock'],
  vantage: ['stock', 'cbw'],
  viper: ['stock', 'cbw'],
  vipersrt10: ['stock', 'rnt']
};

export function makeCarEntry(modelId: string, slotId: string, kitSuffix = "stock") {
  const availableKits = CAR_KITS[modelId] || ["stock"];
  const selectedKit = availableKits.includes(kitSuffix) ? kitSuffix : availableKits[availableKits.length - 1];
  const allKits = availableKits.map(k => `${modelId}_${k}_bkit`);

  return {
    "__desc_id": modelId,
    "tuning": {
      "cells": {
        "0": { "slot_id": 0, "stack": { "amount": 1, "id": `engine_${modelId}` } },
        "1": { "slot_id": 1, "stack": { "amount": 1, "id": "general_transmission_racing" } },
        "2": { "slot_id": 2, "stack": { "amount": 1, "id": "general_differential_racing" } },
        "3": { "slot_id": 3, "stack": { "amount": 1, "id": "general_suspension_racing" } },
        "4": { "slot_id": 4, "stack": { "amount": 1, "id": "general_brakes_racing" } },
        "5": { "slot_id": 5, "stack": { "amount": 1, "id": "general_weight_reduction_racing" } }
      },
      "engine": 3,
      "turbo": 3,
      "brakes": 3,
      "suspension": 3,
      "gearbox": 3,
      "tires": 3
    },
    "appearance": {},
    "body_kit": `${modelId}_${selectedKit}_bkit`,
    "body_kit_set": { "keys": allKits },
    "mileage": 0,
    "wins": 0,
    "slot_id": slotId
  };
}

export function buildBuiltinRegularCars(): Record<string, any> {
  const carsItems: Record<string, any> = {};
  ALL_CAR_MODELS.forEach((modelId, idx) => {
    const id = (1001 + idx).toString();
    carsItems[id] = makeCarEntry(modelId, id, "stock");
  });
  return carsItems;
}

export function getAllBuiltinCars(): Record<string, any> {
  const result: Record<string, any> = {};
  const existingDesc = new Set<string>();

  // 1. Add all tuned cars from PROFILE_TEMPLATE
  if (PROFILE_TEMPLATE && PROFILE_TEMPLATE.cars && PROFILE_TEMPLATE.cars.items) {
    for (const [cid, cfg] of Object.entries(PROFILE_TEMPLATE.cars.items)) {
      if (cfg && typeof cfg === "object" && (cfg as any).__desc_id) {
        result[cid] = JSON.parse(JSON.stringify(cfg));
        existingDesc.add((cfg as any).__desc_id);
      }
    }
  }

  // 2. Add all missing models from ALL_CAR_MODELS with full racing tuning & kits
  let nextId = 2000;
  for (const carId of Object.keys(result)) {
    const num = parseInt(carId, 10);
    if (!isNaN(num) && num >= nextId) nextId = num + 1;
  }

  for (const model of ALL_CAR_MODELS) {
    if (!existingDesc.has(model)) {
      result[String(nextId)] = makeCarEntry(model, String(nextId), "rnt");
      existingDesc.add(model);
      nextId++;
    }
  }

  return result;
}

// ─── ESSENTIAL BOXES & ANTI-GHOST WORLD SPAWN INJECTOR ─────────────────────────
export function injectNewBoxesAndAntiGhost(profile: any) {
  if (!profile || typeof profile !== "object") return profile;

  // 1. Essential Flags (Nitro & Premium)
  profile.styling = profile.styling || {};
  profile.styling.stock_items = Array.from(new Set([...(profile.styling.stock_items || []), "general_nitro_stock"]));

  profile.has_premium = true;
  profile.is_premium_active = true;
  profile.is_premium_max_player = true;
  profile.premium_timer = 99999999;
  profile.premium_length = 99999999;

  // 2. Street Pass & Rewards
  profile.is_pass_owned = true;
  profile.battle_pass_resource_amount = 999999;
  profile.free_reward = { collected: true };
  profile.paid_reward = { collected: true };
  profile.rewards = { free: { collected: true }, paid: { collected: true } };

  const bpKeys: string[] = [];
  for (let i = 1; i <= 16; i++) {
    for (const t of ["banner", "avatar", "frame"]) {
      bpKeys.push(`unlock_${t}_${i}`);
    }
  }
  for (let i = 1; i <= 4; i++) {
    bpKeys.push(`unlock_emoji_${i}`);
  }
  profile.battle_pass_event_rewards = { keys: bpKeys };
  profile.unlocks = { keys: bpKeys };

  // 3. Game State Flags (Prevents 0 resource display & showroom preview freeze)
  profile.has_new_cars_in_showroom = true;
  profile.open_car_showroom_command = true;
  profile.new_car = true;
  profile.car_sale = true;
  profile.special_offers_car_banner = true;
  profile.car_showroom_preview = "car_showroom_preview";
  profile.styling_preview = true;
  profile.tuning_preview = true;
  profile.car_input_control = true;
  profile.unlock_items = true;
  profile.car_class = "CarClass";
  profile.car_power_class = "CarPowerClass";
  profile.car_specific_power = "CarSpecificPower";
  profile.car_rating = "CarRating";
  profile.car_gear_type = "CarGearType";
  profile.business_car_deliveries_completed = 150;
  profile.business_part_deliveries_completed = 300;

  // 4. Empty placeholder objects required by game
  profile.friends = profile.friends || {};
  profile.social = profile.social || {};
  profile.achievements = profile.achievements || {};

  // 5. CRITICAL: TUTORIAL + GHOST MODE / SPAWN FIX (Anti-Ghost / Anti-Freeze)
  profile.is_tutorial_finished = true;
  profile.tutorial_step = 100;
  profile.is_first_start_finished = true;
  profile.is_actual_clubs_send = true;
  profile.has_completed_tutorial = true;
  profile.has_seen_intro = true;
  profile.has_seen_map_tutorial = true;
  profile.onboarding_completed = true;
  profile.is_new_player = false;
  profile.has_first_drive = true;
  profile.has_completed_onboarding = true;
  profile.show_map_on_start = false;
  profile.data_version = 71;
  profile.messaging_version = 13;
  profile.model_upgrade_version = 1;

  // Force clean world spawn to prevent ghost/map-only view
  profile.player_position = profile.player_position || {
    x: -123.45,
    y: 12.3,
    z: 456.78,
    rot_x: 0.0,
    rot_y: 180.0,
    rot_z: 0.0,
    map: "industrial"
  };
  profile.last_map = "industrial";
  profile.current_map = "industrial";

  return profile;
}

let mongoClient: any = null;
async function getMongoClient() {
  if (process.env.MONGODB_URI) {
    if (!mongoClient) {
      try {
        mongoClient = new MongoClient(process.env.MONGODB_URI);
        await mongoClient.connect();
        console.log("[DB] Connected to MongoDB successfully.");
      } catch (err) {
        console.error("[DB ERROR] MongoDB connection failed:", err);
        mongoClient = null;
      }
    }
    return mongoClient;
  }
  return null;
}

// ─── In-memory DB read cache (1-second TTL) ───────────────────────────────────
// Prevents redundant MongoDB/filesystem reads within a single request burst.
let _dbCache: any = null;
let _dbCacheAt = 0;
const DB_CACHE_TTL_MS = 1000; // 1 second

function invalidateDbCache() {
  _dbCache = null;
  _dbCacheAt = 0;
}

// Helper to load keys database
async function loadKeysDb(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _dbCache && (now - _dbCacheAt) < DB_CACHE_TTL_MS) {
    return _dbCache;
  }

  // 1. Try MongoDB
  try {
    const client = await getMongoClient();
    if (client) {
      const db = client.db("rymenbot");
      const collection = db.collection("keys_db");
      const doc = await collection.findOne({ _id: "main_keys_db" });
      if (doc) {
        const result = {
          keys: doc.keys || {},
          authorized_users: doc.authorized_users || {},
          admins: doc.admins || [],
          owners: doc.owners || [],
          total_credits_used: doc.total_credits_used || 0,
          total_accounts_generated: doc.total_accounts_generated || 0,
          custom_regular_cars_string: doc.custom_regular_cars_string || doc.regular_cars_string || "",
          custom_premium_cars_string: doc.custom_premium_cars_string || doc.premium_cars_string || doc.custom_cars_string || "",
          custom_cars_string: doc.custom_premium_cars_string || doc.custom_cars_string || "",
          custom_blueprint_string: doc.custom_blueprint_string || doc.blueprint_string || "",
          strings_updated_at: doc.strings_updated_at || null
        };
        _dbCache = result;
        _dbCacheAt = now;
        return result;
      } else {
        const defaultDb = { keys: {}, authorized_users: {}, admins: [], owners: [], total_credits_used: 0, total_accounts_generated: 0, custom_regular_cars_string: "", custom_premium_cars_string: "", custom_blueprint_string: "" };
        await collection.updateOne({ _id: "main_keys_db" }, { $set: defaultDb }, { upsert: true });
        _dbCache = defaultDb;
        _dbCacheAt = now;
        return defaultDb;
      }
    }
  } catch (err) {
    console.error("[DB ERROR] Failed to load keys from MongoDB:", err);
  }

  // 2. Try Vercel KV REST API
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const url = `${process.env.KV_REST_API_URL}/get/rymenbot_keys_db`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.result) {
          const parsed = JSON.parse(data.result);
          const result = {
            keys: parsed.keys || {},
            authorized_users: parsed.authorized_users || {},
            admins: parsed.admins || [],
            owners: parsed.owners || [],
            total_credits_used: parsed.total_credits_used || 0,
            total_accounts_generated: parsed.total_accounts_generated || 0,
            custom_regular_cars_string: parsed.custom_regular_cars_string || parsed.regular_cars_string || "",
            custom_premium_cars_string: parsed.custom_premium_cars_string || parsed.premium_cars_string || parsed.custom_cars_string || "",
            custom_cars_string: parsed.custom_premium_cars_string || parsed.custom_cars_string || "",
            custom_blueprint_string: parsed.custom_blueprint_string || parsed.blueprint_string || "",
            strings_updated_at: parsed.strings_updated_at || null
          };
          _dbCache = result;
          _dbCacheAt = now;
          return result;
        } else {
          const defaultDb = { keys: {}, authorized_users: {}, admins: [], owners: [], total_credits_used: 0, total_accounts_generated: 0, custom_regular_cars_string: "", custom_premium_cars_string: "", custom_blueprint_string: "" };
          await saveKeysDb(defaultDb);
          _dbCache = defaultDb;
          _dbCacheAt = now;
          return defaultDb;
        }
      }
    } catch (err) {
      console.error("[DB ERROR] Failed to load keys from Vercel KV:", err);
    }
  }

  // 3. Fallback to Local Filesystem
  const filePath = getKeysFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const result = {
        keys: data.keys || {},
        authorized_users: data.authorized_users || {},
        admins: data.admins || [],
        owners: data.owners || [],
        total_credits_used: data.total_credits_used || 0,
        total_accounts_generated: data.total_accounts_generated || 0,
        custom_regular_cars_string: data.custom_regular_cars_string || data.regular_cars_string || "",
        custom_premium_cars_string: data.custom_premium_cars_string || data.premium_cars_string || data.custom_cars_string || "",
        custom_cars_string: data.custom_premium_cars_string || data.custom_cars_string || "",
        custom_blueprint_string: data.custom_blueprint_string || data.blueprint_string || "",
        strings_updated_at: data.strings_updated_at || null
      };
      _dbCache = result;
      _dbCacheAt = now;
      return result;
    } catch (e) {
      console.error("[KEYS ERROR] Failed to parse keys.json", e);
    }
  }

  // If on Vercel and file wasn't found in /tmp, try loading initial keys.json from read-only function dir
  if (filePath !== KEYS_FILE && fs.existsSync(KEYS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(KEYS_FILE, "utf-8"));
      const result = {
        keys: data.keys || {},
        authorized_users: data.authorized_users || {},
        admins: data.admins || [],
        owners: data.owners || [],
        total_credits_used: data.total_credits_used || 0,
        total_accounts_generated: data.total_accounts_generated || 0,
        custom_regular_cars_string: data.custom_regular_cars_string || data.regular_cars_string || "",
        custom_premium_cars_string: data.custom_premium_cars_string || data.premium_cars_string || data.custom_cars_string || "",
        custom_cars_string: data.custom_premium_cars_string || data.custom_cars_string || "",
        custom_blueprint_string: data.custom_blueprint_string || data.blueprint_string || "",
        strings_updated_at: data.strings_updated_at || null
      };
      _dbCache = result;
      _dbCacheAt = now;
      return result;
    } catch (e) {
      console.error("[KEYS ERROR] Failed to parse initial keys.json", e);
    }
  }

  const defaultDb = { keys: {}, authorized_users: {}, admins: [], owners: [], total_credits_used: 0, total_accounts_generated: 0, custom_regular_cars_string: "", custom_premium_cars_string: "", custom_blueprint_string: "" };
  await saveKeysDb(defaultDb);
  _dbCache = defaultDb;
  _dbCacheAt = now;
  return defaultDb;
}

// Helper to save keys database
async function saveKeysDb(db: any) {
  // Always invalidate cache on write
  invalidateDbCache();

  const cleanDb = {
    keys: db.keys || {},
    authorized_users: db.authorized_users || {},
    admins: db.admins || [],
    owners: db.owners || [],
    total_credits_used: db.total_credits_used || 0,
    total_accounts_generated: db.total_accounts_generated || 0,
    custom_regular_cars_string: db.custom_regular_cars_string ?? db.regular_cars_string ?? "",
    custom_premium_cars_string: db.custom_premium_cars_string ?? db.premium_cars_string ?? db.custom_cars_string ?? "",
    custom_cars_string: db.custom_premium_cars_string ?? db.custom_cars_string ?? "",
    custom_blueprint_string: db.custom_blueprint_string ?? db.blueprint_string ?? "",
    strings_updated_at: db.strings_updated_at ?? Date.now()
  };

  let savedToDb = false;

  // 1. Try MongoDB
  try {
    const client = await getMongoClient();
    if (client) {
      const collection = client.db("rymenbot").collection("keys_db");
      await collection.updateOne({ _id: "main_keys_db" }, { $set: cleanDb }, { upsert: true });
      console.log("[DB] Successfully saved keys to MongoDB.");
      savedToDb = true;
    }
  } catch (err) {
    console.error("[DB ERROR] Failed to save keys to MongoDB:", err);
  }

  // 2. Try Vercel KV REST API
  if (!savedToDb && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const url = `${process.env.KV_REST_API_URL}/set/rymenbot_keys_db`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
        body: JSON.stringify(cleanDb)
      });
      if (res.ok) {
        console.log("[DB] Successfully saved keys to Vercel KV.");
        savedToDb = true;
      }
    } catch (err) {
      console.error("[DB ERROR] Failed to save keys to Vercel KV:", err);
    }
  }

  // 3. Mirror/fallback to Local Filesystem
  try {
    const targetPath = getKeysFilePath();
    fs.writeFileSync(targetPath, JSON.stringify(cleanDb, null, 2), "utf-8");
    console.log(`[KEYS] Successfully mirrored keys to: ${targetPath}`);
    saveKeysToCsv(cleanDb);
  } catch (e) {
    if (!savedToDb) {
      console.error("[KEYS ERROR] Failed to write keys database, trying /tmp fallback", e);
      try {
        fs.writeFileSync(TMP_KEYS_FILE, JSON.stringify(cleanDb, null, 2), "utf-8");
        console.log("[KEYS] Successfully saved keys to /tmp fallback");
        saveKeysToCsv(cleanDb);
      } catch (tmpErr) {
        console.error("[KEYS ERROR] Failed to write to /tmp fallback as well", tmpErr);
      }
    } else {
      console.log("[KEYS] Mirror to local filesystem skipped or read-only (expected on Vercel)");
    }
  }
}

// Generate random license keys
function generateLicenseKey() {
  const p1 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `RRT_${p1}_${p2}_${p3}`;
}

// In-memory Bulk accounts job tracker
const bulkJobs: Record<string, {
  status: string;
  progress: number;
  total: number;
  logs: string[];
  results: Array<{ email: string; status: string; message?: string; password?: string; user_id?: string }>;
}> = {};

import { EMBEDDED_PROFILE_TEMPLATE } from "./profile_template";

// Decode and decompress EMBEDDED_PROFILE_TEMPLATE at startup
let cachedProfileTemplate: any = null;
try {
  const decoded = Buffer.from(EMBEDDED_PROFILE_TEMPLATE, "base64");
  let decompressed: Buffer;
  try {
    decompressed = zlib.gunzipSync(decoded.subarray(4));
  } catch {
    decompressed = zlib.gunzipSync(decoded);
  }
  cachedProfileTemplate = JSON.parse(decompressed.toString("utf-8"));

  // Clean the template to strictly enforce limits (16 avatars, 16 banners, 16 frames, 4 quick chats)
  if (cachedProfileTemplate && cachedProfileTemplate.battle_pass_event_rewards && cachedProfileTemplate.battle_pass_event_rewards.keys) {
    const keys = cachedProfileTemplate.battle_pass_event_rewards.keys;
    cachedProfileTemplate.battle_pass_event_rewards.keys = keys.filter((key: string) => {
      const avatarMatch = key.match(/^unlock_avatar_(\d+)$/i);
      const bannerMatch = key.match(/^unlock_banner_(\d+)$/i);
      const frameMatch = key.match(/^unlock_frame_(\d+)$/i);
      const emojiMatch = key.match(/^unlock_emoji_(\d+)$/i);

      if (avatarMatch && parseInt(avatarMatch[1], 10) > 16) return false;
      if (bannerMatch && parseInt(bannerMatch[1], 10) > 16) return false;
      if (frameMatch && parseInt(frameMatch[1], 10) > 16) return false;
      if (emojiMatch && parseInt(emojiMatch[1], 10) > 4) return false;
      return true;
    });
  }

  // Enforce exactly 4 active slots for quick chats in template (prevents loading freeze)
  if (cachedProfileTemplate) {
    cachedProfileTemplate.emoji = {
      keys: ["0", "1", "2", "3"],
      values: ["emoji_1", "emoji_2", "emoji_3", "emoji_4"]
    };
  }

  console.log("[TEMPLATE] Successfully loaded and filtered rich profile template!");
} catch (e) {
  console.error("[TEMPLATE ERROR] Failed to load rich profile template:", e);
}

const PROFILE_TEMPLATE = cachedProfileTemplate;

// ============================================================
// COMPRESSION & DECOMPRESSION (Matches CarX Street Gzip Protocol)
// ============================================================
export function compressData(profile: any): string {
  try {
    const raw = Buffer.from(JSON.stringify(profile), "utf-8");
    const gz = zlib.gzipSync(raw);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(raw.length, 0);
    return Buffer.concat([lenBuf, gz]).toString("base64");
  } catch (e: any) {
    console.error("[COMPRESS ERROR]", e.message || e);
    const raw = Buffer.from(JSON.stringify(profile), "utf-8");
    return raw.toString("base64");
  }
}

export function decompressData(s: string | undefined | null): any {
  if (!s || typeof s !== "string") return null;
  let trimmed = s.trim();
  if (!trimmed) return null;

  // Remove potential outer quotes
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  // 1. Direct JSON check
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch { }
  }

  // 2. Handle "l84l" prefix format (used by Python bot variant: "l84l" + base64(b"\x00" + gzip))
  if (trimmed.startsWith("l84l")) {
    try {
      const raw = Buffer.from(trimmed.substring(4), "base64");
      try {
        const decompressed = zlib.gunzipSync(raw.subarray(1));
        return JSON.parse(decompressed.toString("utf-8"));
      } catch {
        const decompressed = zlib.gunzipSync(raw);
        return JSON.parse(decompressed.toString("utf-8"));
      }
    } catch { }
  }

  // 3. Base64 Decompression
  try {
    const raw = Buffer.from(trimmed, "base64");
    // Standard CarX protocol has 4-byte length prefix
    if (raw.length > 4) {
      try {
        const decompressed = zlib.gunzipSync(raw.subarray(4));
        return JSON.parse(decompressed.toString("utf-8"));
      } catch { }
    }
    // Try raw gzip
    try {
      const decompressed = zlib.gunzipSync(raw);
      return JSON.parse(decompressed.toString("utf-8"));
    } catch {
      // Try inflate
      try {
        const decompressed = zlib.inflateSync(raw);
        return JSON.parse(decompressed.toString("utf-8"));
      } catch {
        return JSON.parse(raw.toString("utf-8"));
      }
    }
  } catch (e: any) {
    console.warn("[DECOMPRESS WARN] Unable to decompress string:", e.message || e);
  }
  return null;
}

// ============================================================
// CAR EXTRACTION UTILITIES (Supports full profile, cars dict, or raw items)
// ============================================================
export function extractCarsFromObject(data: any): Record<string, any> | null {
  if (!data || typeof data !== "object") return null;
  let cars: Record<string, any> = {};

  if (data.cars && typeof data.cars === "object") {
    if (data.cars.items && typeof data.cars.items === "object") {
      cars = data.cars.items;
    } else {
      cars = data.cars;
    }
  } else if (data.items && typeof data.items === "object") {
    cars = data.items;
  } else {
    // Check if data itself or any property is the cars dictionary
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (v && typeof v === "object") {
        if (v.__desc_id) {
          cars = data;
          break;
        } else if (v.items && typeof v.items === "object") {
          cars = v.items;
          break;
        }
      }
    }
  }

  const extracted: Record<string, any> = {};
  for (const [cid, cfg] of Object.entries(cars)) {
    if (cfg && typeof cfg === "object" && (cfg as any).__desc_id) {
      extracted[String(cid)] = JSON.parse(JSON.stringify(cfg));
    }
  }

  return Object.keys(extracted).length > 0 ? extracted : null;
}

export function extractCarsFromFileContent(content: string | undefined | null): Record<string, any> | null {
  if (!content || typeof content !== "string") return null;
  let trimmed = content.trim();
  if (!trimmed) return null;

  // Remove possible outer quotes or trailing semicolons
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    trimmed = trimmed.substring(1, trimmed.length - 1).trim();
  }

  // 1. Try decompressing directly
  const decompressed = decompressData(trimmed);
  if (decompressed) {
    const extracted = extractCarsFromObject(decompressed);
    if (extracted && Object.keys(extracted).length > 0) return extracted;
  }

  // 2. Try raw JSON
  try {
    const parsed = JSON.parse(trimmed);
    const extracted = extractCarsFromObject(parsed);
    if (extracted && Object.keys(extracted).length > 0) return extracted;
  } catch { }

  // 3. Try searching for Base64 compressed string inside code / file (e.g. `REGULAR_CARS_STRING = "..."`)
  const b64Match = trimmed.match(/["']([A-Za-z0-9+/=]{100,})["']/);
  if (b64Match && b64Match[1]) {
    const fromB64 = decompressData(b64Match[1]);
    if (fromB64) {
      const extracted = extractCarsFromObject(fromB64);
      if (extracted && Object.keys(extracted).length > 0) return extracted;
    }
  }

  // 4. Try Python dictionary syntax (convert single quotes, True, False, None)
  try {
    const dictMatch = trimmed.match(/\{[\s\S]*\}/);
    if (dictMatch) {
      const jsonCandidate = dictMatch[0]
        .replace(/'/g, '"')
        .replace(/:\s*True\b/g, ': true')
        .replace(/:\s*False\b/g, ': false')
        .replace(/:\s*None\b/g, ': null');
      const parsed = JSON.parse(jsonCandidate);
      const extracted = extractCarsFromObject(parsed);
      if (extracted && Object.keys(extracted).length > 0) return extracted;
    }
  } catch { }

  return null;
}

// In-memory cache for loaded cars
let _cachedRegularCars: Record<string, any> | null = null;
let _cachedRegularCarsSrc = "";
let _cachedPremiumCars: Record<string, any> | null = null;
let _cachedPremiumCarsSrc = "";

export function getRegularCarData(db?: any): Record<string, any> {
  const customReg = db?.custom_regular_cars_string;
  if (customReg && typeof customReg === "string" && customReg.trim()) {
    if (customReg === _cachedRegularCarsSrc && _cachedRegularCars) {
      return _cachedRegularCars;
    }
    const cars = extractCarsFromFileContent(customReg);
    if (cars && Object.keys(cars).length > 0) {
      _cachedRegularCars = cars;
      _cachedRegularCarsSrc = customReg;
      return cars;
    }
  }
  return getAllBuiltinCars();
}

export function getPremiumCarData(db?: any): Record<string, any> {
  const customPrem = db?.custom_premium_cars_string || db?.custom_cars_string;
  if (customPrem && typeof customPrem === "string" && customPrem.trim()) {
    if (customPrem === _cachedPremiumCarsSrc && _cachedPremiumCars) {
      return _cachedPremiumCars;
    }
    const cars = extractCarsFromFileContent(customPrem);
    if (cars && Object.keys(cars).length > 0) {
      _cachedPremiumCars = cars;
      _cachedPremiumCarsSrc = customPrem;
      return cars;
    }
  }
  return getAllBuiltinCars();
}

// Backward-compatibility wrapper for getCarsTemplateForPackage
function getCarsTemplateForPackage(pkg: "regular" | "premium" | "all" | undefined, db?: any): any {
  const cars = pkg === "regular" ? getRegularCarData(db) : getPremiumCarData(db);
  const base = PROFILE_TEMPLATE ? structuredClone(PROFILE_TEMPLATE) : {};
  base.cars = { seed: 1000, items: cars };
  base.car_models = {
    keys: Object.keys(cars).map(String),
    values: Object.values(cars).map((v: any) => v.__desc_id || "")
  };
  return base;
}

// ============================================================
// REAL ESTATE & SLOT ASSIGNMENT (Ensures 100% valid game database references)
// ============================================================
export function ensureRealEstateSlotsForCars(profile: any) {
  if (!profile.real_estates) profile.real_estates = {};
  if (!profile.real_estate_slots) profile.real_estate_slots = {};

  for (const prop of REAL_ESTATE_PROPERTIES) {
    const slots = [
      { unlocked: true, car_id: "", is_empty: true },
      { unlocked: true, car_id: "", is_empty: true },
      { unlocked: true, car_id: "", is_empty: true }
    ];
    if (!profile.real_estates[prop]) {
      profile.real_estates[prop] = { is_bought: true, slots };
    } else {
      profile.real_estates[prop].is_bought = true;
      if (!Array.isArray(profile.real_estates[prop].slots) || profile.real_estates[prop].slots.length !== 3) {
        profile.real_estates[prop].slots = slots;
      } else {
        for (const slot of profile.real_estates[prop].slots) {
          slot.unlocked = true;
          if (slot.car_id === undefined) slot.car_id = "";
        }
      }
    }

    for (let i = 0; i < 3; i++) {
      const slotId = `${prop}_slot_${i}`;
      if (!profile.real_estate_slots[slotId]) {
        profile.real_estate_slots[slotId] = { unlocked: true, car_id: "" };
      } else {
        profile.real_estate_slots[slotId].unlocked = true;
        if (profile.real_estate_slots[slotId].car_id === undefined) {
          profile.real_estate_slots[slotId].car_id = "";
        }
      }
    }
  }

  // Location objects set
  if (!profile.locations) profile.locations = {};
  if (!profile.locations.default) profile.locations.default = {};
  if (!profile.locations.default.location_objects_set) {
    profile.locations.default.location_objects_set = { keys: [] };
  }
  const locKeys: string[] = profile.locations.default.location_objects_set.keys;
  for (const p of [...REAL_ESTATE_PROPERTIES, ...EXTRA_LOCATION_KEYS]) {
    if (!locKeys.includes(p)) {
      locKeys.push(p);
    }
  }

  // Assign cars to real estate slots
  profile.car_to_real_estate_slot = { keys: [] as string[], values: [] as string[] };
  const carsItems = profile.cars?.items || {};
  const carIds = Object.keys(carsItems).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  let activeCarId = carIds[0] || "1001";
  for (const carId of carIds) {
    if (carsItems[carId]?.__desc_id === "toyotasupra2020") {
      activeCarId = carId;
      break;
    }
  }
  profile.current_car_id = typeof profile.current_car_id === "number" ? parseInt(activeCarId, 10) : activeCarId;

  const availableSlots = Object.keys(profile.real_estate_slots).filter(
    s => profile.real_estate_slots[s]?.unlocked
  );

  for (let i = 0; i < carIds.length; i++) {
    const carId = carIds[i];
    if (i < availableSlots.length) {
      const slotName = availableSlots[i];
      profile.real_estate_slots[slotName].car_id = carId;
      profile.car_to_real_estate_slot.keys.push(carId);
      profile.car_to_real_estate_slot.values.push(slotName);
    }
  }
}

// ============================================================
// ULTIMATE MAP UNLOCK
// ============================================================
export function unlockMapsUltimate(profile: any) {
  if (!profile.game_world_parts) profile.game_world_parts = {};
  for (const m of ['industrial', 'midtown', 'suburb', 'port', 'mountain', 'sunset']) {
    profile.game_world_parts[m] = { unlocked: true };
  }

  ensureRealEstateSlotsForCars(profile);

  if (!profile.race_generators) profile.race_generators = {};
  const ts = Math.floor(Date.now() / 1000);
  const mountain = profile.race_generators.game_world_mountain_farm_races || (profile.race_generators.game_world_mountain_farm_races = {});
  mountain.races_counter = { keys: ["mountain_race_farm_drift_DM001", "mountain_race_farm_sprint_ST001", "mountain_race_farm_free_drift_AO01", "mountain_race_farm_gymkhana_ao04"], values: [1, 2, 3, 4] };
  mountain.races_set = { keys: ["mountain_race_farm_drift_DM005", "mountain_race_farm_sprint_ST004", "mountain_race_farm_free_drift_AO02", "mountain_race_farm_gymkhana_ao08"], values: [1, 2, 3, 4] };

  const sunset = profile.race_generators.game_world_sunset_farm_races || (profile.race_generators.game_world_sunset_farm_races = {});
  sunset.races_counter = { keys: ["speedway_race_farm_free_drift_AO01", "speedway_race_farm_sprint_DM01", "speedway_race_farm_sprint_DM05", "speedway_race_farm_gymkhana_ao01"], values: [1, 2, 3, 4] };
  sunset.races_set = { keys: ["speedway_race_farm_free_drift_AO02", "speedway_race_farm_sprint_DM02", "speedway_race_simple_drift_DM01", "speedway_race_farm_gymkhana_ao01"], values: [1, 2, 3, 4] };

  if (!profile.races_ts) profile.races_ts = { keys: [], values: [] };
  const allKeys: string[] = [
    ...(mountain.races_counter?.keys || []),
    ...(mountain.races_set?.keys || []),
    ...(sunset.races_counter?.keys || []),
    ...(sunset.races_set?.keys || [])
  ];
  for (const k of allKeys) {
    if (!profile.races_ts.keys.includes(k)) {
      profile.races_ts.keys.push(k);
      profile.races_ts.values.push(ts);
    }
  }

  profile.is_tutorial_finished = true;
  profile.tutorial_step = 600;
  return profile;
}

// ============================================================
// PROFILE-BASED CAR INJECTION (Matches Python Reference Bot)
// ============================================================
export function implantCarsProfile(
  profile: any,
  carsToAdd: Record<string, any>
): { profile: any; added: number; skipped: string[] } {
  if (!carsToAdd || Object.keys(carsToAdd).length === 0) {
    return { profile, added: 0, skipped: [] };
  }

  if (!profile.cars) profile.cars = {};
  if (!profile.cars.items || typeof profile.cars.items !== "object") profile.cars.items = {};

  const existing: Record<string, any> = profile.cars.items;

  let maxId = 1000;
  for (const carId of Object.keys(existing)) {
    const cid = parseInt(carId, 10);
    if (!isNaN(cid) && cid > maxId) {
      maxId = cid;
    }
  }

  let added = 0;
  for (const [srcCarId, srcCar] of Object.entries(carsToAdd)) {
    if (!srcCar || typeof srcCar !== "object") continue;
    const descId = srcCar.__desc_id;
    if (!descId) continue;

    maxId += 1;
    const newCar = JSON.parse(JSON.stringify(srcCar));
    newCar.slot_id = String(maxId);
    existing[String(maxId)] = newCar;
    added += 1;
  }

  profile.cars = { seed: Math.max(1000, maxId + 1), items: existing };

  // Sync car_models
  const allCarIds = Object.keys(existing);
  profile.car_models = {
    keys: allCarIds.map(String),
    values: allCarIds.map(cid => existing[cid]?.__desc_id || "")
  };

  if (!profile.current_car_id || !existing[String(profile.current_car_id)]) {
    profile.current_car_id = allCarIds[0] ? (typeof profile.current_car_id === "number" ? parseInt(allCarIds[0], 10) : allCarIds[0]) : 1001;
  }

  unlockMapsUltimate(profile);

  return { profile, added, skipped: [] };
}

function intParse(val: string): number {
  const p = parseInt(val, 10);
  return isNaN(p) ? 0 : p;
}

// Shared helper to extract profile stats from various CarX API response structures
function extractProfileStats(profile: any, debug = false) {
  // Debug logging removed

  // Resolve the actual resources object - CarX API may wrap in many ways
  let res = profile.resources || null;
  if (!res && profile.profile) res = profile.profile.resources || null;
  if (!res && profile.data) res = profile.data.resources || null;
  // Some responses put resources under statistics or stats
  if (!res && profile.statistics) res = profile.statistics.resources || profile.statistics;
  if (!res && profile.stats) res = profile.stats.resources || profile.stats;
  if (!res && profile.profileData) res = profile.profileData.resources || profile.profileData;
  if (!res && profile.player) res = profile.player.resources || profile.player;
  if (!res && profile.account) res = profile.account.resources || profile.account;
  // Deep search up to 3 levels for any object with 'resources' property
  if (!res) {
    for (const key of Object.keys(profile)) {
      const v = profile[key];
      if (v && typeof v === "object" && v.resources) { res = v.resources; break; }
    }
  }
  // Also search for soft/hard/experience directly on nested objects
  if (!res) {
    for (const key of Object.keys(profile)) {
      const v = profile[key];
      if (v && typeof v === "object" && (v.soft || v.hard || v.experience || v.soft_currency || v.hard_currency || v.cash || v.gold)) {
        res = v; break;
      }
    }
  }
  // Debug logging removed

  // Cash (soft currency) - try EVERY possible path
  let cash = 0;
  if (res) {
    cash = res.soft?.amount ?? res.soft_currency ?? res.cash ?? res.soft_currency_amount
      ?? res.softCurrency?.amount ?? res.softCurrency ?? res.soft ?? 0;
    // Handle case where soft is a number directly (not an object)
    if (!cash && typeof res.soft === "number") cash = res.soft;
    if (!cash && typeof res.soft === "string") cash = parseInt(res.soft, 10) || 0;
    if (!cash && typeof res.softCurrency === "number") cash = res.softCurrency;
  }
  if (!cash) cash = profile.cash ?? profile.soft_currency ?? profile.money
    ?? profile.soft_currency_amount ?? profile.softCurrency ?? profile.soft ?? 0;
  // Try inside profile.profile sub-object
  if (!cash && profile.profile) cash = profile.profile.cash ?? profile.profile.soft_currency ?? profile.profile.soft ?? 0;
  // Try inside profile.data sub-object
  if (!cash && profile.data) cash = profile.data.cash ?? profile.data.soft_currency ?? profile.data.soft ?? 0;
  // Try inside profile.profileData sub-object
  if (!cash && profile.profileData) cash = profile.profileData.cash ?? profile.profileData.soft_currency ?? profile.profileData.soft ?? 0;
  // Try inside profile.player sub-object
  if (!cash && profile.player) cash = profile.player.cash ?? profile.player.soft_currency ?? profile.player.soft ?? 0;
  cash = typeof cash === "string" ? parseInt(cash, 10) || 0 : Number(cash) || 0;

  // Gold (hard currency) - try EVERY possible path
  let gold = 0;
  if (res) {
    gold = res.hard?.amount ?? res.hard_currency ?? res.gold ?? res.hard_currency_amount
      ?? res.hardCurrency?.amount ?? res.hardCurrency ?? res.hard ?? 0;
    // Handle case where hard is a number directly (not an object)
    if (!gold && typeof res.hard === "number") gold = res.hard;
    if (!gold && typeof res.hard === "string") gold = parseInt(res.hard, 10) || 0;
    if (!gold && typeof res.hardCurrency === "number") gold = res.hardCurrency;
  }
  if (!gold) gold = profile.gold ?? profile.hard_currency ?? profile.premium_currency
    ?? profile.hard_currency_amount ?? profile.hardCurrency ?? profile.hard ?? 0;
  // Try inside profile.profile sub-object
  if (!gold && profile.profile) gold = profile.profile.gold ?? profile.profile.hard_currency ?? profile.profile.hard ?? 0;
  // Try inside profile.data sub-object
  if (!gold && profile.data) gold = profile.data.gold ?? profile.data.hard_currency ?? profile.data.hard ?? 0;
  // Try inside profile.profileData sub-object
  if (!gold && profile.profileData) gold = profile.profileData.gold ?? profile.profileData.hard_currency ?? profile.profileData.hard ?? 0;
  // Try inside profile.player sub-object
  if (!gold && profile.player) gold = profile.player.gold ?? profile.player.hard_currency ?? profile.player.hard ?? 0;
  gold = typeof gold === "string" ? parseInt(gold, 10) || 0 : Number(gold) || 0;

  // Level - try EVERY possible path
  let level = 1;
  if (res) {
    level = res.experience?.award_index ?? res.experience?.level ?? res.level ?? res.award_index ?? 1;
    // Handle case where experience is a number directly
    if (level === 1 && typeof res.experience === "number") level = 1;
  }
  if (level === 1) level = profile.level ?? profile.player_level ?? profile.playerLevel ?? profile.award_index ?? profile.level_index ?? 1;
  if (level === 1 && profile.profile) level = profile.profile.level ?? profile.profile.player_level ?? profile.profile.award_index ?? 1;
  if (level === 1 && profile.data) level = profile.data.level ?? profile.data.player_level ?? 1;
  if (level === 1 && profile.profileData) level = profile.profileData.level ?? profile.profileData.player_level ?? 1;
  if (level === 1 && profile.player) level = profile.player.level ?? profile.player.player_level ?? 1;
  level = typeof level === "string" ? parseInt(level, 10) || 1 : Number(level) || 1;

  // EXP - try EVERY possible path
  let exp = 0;
  if (res) {
    exp = res.experience?.amount ?? res.experience?.xp ?? res.exp ?? res.experience_amount ?? 0;
    // Handle case where experience is a number directly
    if (!exp && typeof res.experience === "number") exp = res.experience;
    if (!exp && typeof res.experience === "string") exp = parseInt(res.experience, 10) || 0;
  }
  if (!exp) exp = profile.exp ?? profile.experience ?? profile.xp ?? profile.experience_amount ?? profile.xp_amount ?? 0;
  if (!exp && profile.profile) exp = profile.profile.exp ?? profile.profile.experience ?? profile.profile.xp ?? 0;
  if (!exp && profile.data) exp = profile.data.exp ?? profile.data.experience ?? 0;
  if (!exp && profile.profileData) exp = profile.profileData.exp ?? profile.profileData.experience ?? 0;
  if (!exp && profile.player) exp = profile.player.exp ?? profile.player.experience ?? 0;
  exp = typeof exp === "string" ? parseInt(exp, 10) || 0 : Number(exp) || 0;

  // Name - try many paths including nested profile.profile
  const name = profile.name || profile.nickname || profile.username || profile.display_name
    || profile.player_name || profile.profileName || (profile.profile?.nickname) || (profile.profile?.name) || null;
  const avatar = profile.avatar || profile.avatarUrl || profile.avatar_url
    || (profile.profile?.avatar) || null;
  const lastUpdated = profile.date_time || profile.updated_at || profile.last_save
    || profile.last_updated || profile.dateTime || (profile.profile?.date_time) || null;

  // Verified - check many possible field names and types (boolean, number, string)
  // Also check nested paths (profile.profile.*, profile.data.*) for CarX API variants
  const verifySources = [profile, profile.profile, profile.data, profile.d, profile.account, profile.user].filter(Boolean);
  let isVerified = false;
  const verifyKeys = [
    "isEmailVerified", "email_verified", "verified", "emailVerified",
    "email_confirmed", "confirmed", "is_confirmed", "accountVerified",
    "isVerified", "verification_status", "verified_status",
    "verify_state", "verifyState", "email_confirmed"
  ];
  for (const src of verifySources) {
    if (isVerified) break;
    for (const key of verifyKeys) {
      const val = src[key];
      if (val === true || val === 1 || val === "1") { isVerified = true; break; }
      if (typeof val === "string" && val.toLowerCase() === "true") { isVerified = true; break; }
      if (val === "verified") { isVerified = true; break; }
    }
  }

  if (debug) {
    // Log all possible verify-related fields for debugging (including nested sources)
    const verifyFields: Record<string, any> = {};
    for (const src of verifySources) {
      for (const key of Object.keys(src)) {
        if (key.toLowerCase().includes("verif") || key.toLowerCase().includes("confirm") || key.toLowerCase().includes("email")) {
          verifyFields[key] = src[key];
        }
      }
    }
    console.log("[PROFILE EXTRACT] Verify fields:", JSON.stringify(verifyFields));
    console.log("[PROFILE EXTRACT] Result:", { cash, gold, level, exp, name, isVerified });
  }

  let finalCash = cash;
  if (finalCash === 0 && level === 1 && gold === 0) {
    finalCash = 21000;
  }

  // Cars count
  let carsCount = 0;
  if (profile.cars) {
    if (profile.cars.items && typeof profile.cars.items === "object") {
      carsCount = Object.keys(profile.cars.items).length;
    } else if (typeof profile.cars === "object") {
      carsCount = Object.keys(profile.cars).length;
    }
  } else if (profile.car_models && profile.car_models.values && Array.isArray(profile.car_models.values)) {
    carsCount = profile.car_models.values.length;
  }

  // Maps count
  let mapsCount = 0;
  if (profile.game_world_parts && typeof profile.game_world_parts === "object") {
    mapsCount = Object.values(profile.game_world_parts).filter((v: any) => v && (v.unlocked || v === true)).length;
  }

  const streetPass = !!(profile.is_pass_owned || profile.has_premium || profile.is_premium_active || profile.resources?.street_pass || profile.resources?.battle_pass_resource);
  const premium = !!(profile.has_premium || profile.is_premium_active || profile.is_premium_max_player);

  return {
    cash: finalCash,
    silver: finalCash,
    gold,
    level,
    exp,
    xp: exp,
    name,
    avatar,
    lastUpdated,
    isVerified,
    cars: carsCount,
    maps: mapsCount,
    streetPass,
    premium
  };
}

// CarX API Requester Client
class CarXClient {
  static getDeviceIds() {
    const deviceId = crypto.randomBytes(8).toString("hex");
    const uniqueId = crypto.randomBytes(16).toString("hex");
    return { deviceId, uniqueId };
  }

  // Fire-and-forget device registration — does not block callers
  static registerDevice(deviceId: string) {
    fetch(`${BASE_URL}/register_device`, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        deviceId,
        platform: "android",
        project: 4
      })
    })
      .then(async res => {
        await res.text().catch(() => "");
      })
      .catch(e => console.log("[CARX DEVICE REG ERROR] Skipped:", e));
  }

  static async authenticate(endpoint: "login" | "register", email: string, pass: string, customDeviceId?: string, customUniqueId?: string) {
    try {
      const deviceId = customDeviceId || crypto.randomBytes(8).toString("hex");
      const uniqueId = customUniqueId || crypto.randomUUID().replace(/-/g, "");

      // Fire-and-forget — don't block authentication
      CarXClient.registerDevice(deviceId);

      const payload: any = {
        username: email,
        password: pass,
        deviceId,
        uniqueId,
        unipId: uniqueId,
        unip_id: uniqueId,
        platform: "android",
        project: 4
      };

      if (endpoint === "register") {
        payload.name = email.split("@")[0];
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${BASE_URL}/${endpoint}`, {
        method: "POST",
        headers: DEFAULT_HEADERS,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        const d = data.d || data;
        const token = d.token;
        const userId = d.carxId || d.carx_id || d.id || d.userId || d.user_id || d.uid;
        const unipId = d.unipId || d.unip_id || uniqueId;
        return { success: true, token, userId, deviceId, uniqueId, unipId, data: d };
      } else {
        const errText = await response.text();
        let errMsg = errText;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.message || (errJson.e && errJson.e.message) || errText;
        } catch { }
        return { success: false, message: errMsg };
      }
    } catch (e: any) {
      return { success: false, message: e.message || "Network Connection Error" };
    }
  }

  static async verifyAccount(email: string, pass: string, code: string, token?: string, customDeviceId?: string, customUniqueId?: string) {
    try {
      const deviceId = customDeviceId || crypto.randomBytes(8).toString("hex");
      const uniqueId = customUniqueId || crypto.randomUUID().replace(/-/g, "");

      let activeToken = token;
      if (!activeToken) {
        console.log("[VERIFY] No token provided. Logging in first to get a token...");
        const loginRes = await CarXClient.authenticate("login", email, pass, deviceId, uniqueId);
        if (loginRes.success && loginRes.token) {
          activeToken = loginRes.token;
        } else {
          return { success: false, message: loginRes.message || "Failed to log in to obtain verification token." };
        }
      }

      CarXClient.registerDevice(deviceId);

      const headers = {
        ...DEFAULT_HEADERS,
        "Authorization": `Bearer ${activeToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      };

      const body = new URLSearchParams({
        username: email,
        password: pass,
        code,
        deviceId,
        uniqueId,
        unipId: uniqueId,
        unip_id: uniqueId,
        platform: "android",
        project: "4"
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${BASE_URL}/verify`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        const d = data.d || data;
        const respToken = d.token || activeToken;
        const userId = d.carxId || d.carx_id || d.id || d.userId || d.user_id || d.uid;
        const unipId = d.unipId || d.unip_id || uniqueId;
        return { success: true, token: respToken, userId, deviceId, uniqueId, unipId, data: d };
      } else {
        const errText = await response.text();
        let errMsg = errText;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.message || (errJson.e && errJson.e.message) || errText;
        } catch { }
        return { success: false, message: errMsg };
      }
    } catch (e: any) {
      return { success: false, message: e.message || "Network Connection Error" };
    }
  }

  // Fetch profile - decompresses CarX compressed_data format (matches python reference bot)
  static async getProfile(token: string, userId?: string, deviceId?: string, uniqueId?: string) {
    const headers: Record<string, string> = {
      "User-Agent": "UnityPlayer/6000.0.64f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)",
      "Accept": "application/json",
      "Authorization": fToken(token)
    };
    if (deviceId) {
      headers["Device-Id"] = deviceId;
      headers["X-Device-Id"] = deviceId;
    }
    if (uniqueId) {
      headers["Unique-Id"] = uniqueId;
      headers["X-Unique-Id"] = uniqueId;
      headers["Unip-Id"] = uniqueId;
      headers["X-Unip-Id"] = uniqueId;
      headers["UnipId"] = uniqueId;
      headers["X-UnipId"] = uniqueId;
    }

    function findCompressed(obj: any): string | null {
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.compressed_data === "string" && obj.compressed_data.trim()) {
        return obj.compressed_data.trim();
      }
      for (const k of Object.keys(obj)) {
        const val = obj[k];
        if (val && typeof val === "object") {
          const res = findCompressed(val);
          if (res) return res;
        }
      }
      return null;
    }

    const urls = [`${GAME_BASE_URL}/profiles`];
    if (userId) {
      const numericId = typeof userId === "string" ? userId.replace(/\D/g, "") : String(userId);
      if (numericId && numericId !== userId) urls.push(`${GAME_BASE_URL}/profiles/${numericId}`);
      urls.push(`${GAME_BASE_URL}/profiles/${userId}`);
    }

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(15000)
        });

        if (res.status === 200 || res.status === 201) {
          const data = await res.json();
          const compressed = findCompressed(data);
          if (compressed) {
            const decompressed = decompressData(compressed);
            if (decompressed) {
              console.log(`[PROFILE FETCH] Decompressed profile data from ${url}`);
              return { profile: decompressed, response: res, isWrappedInD: true, isWrappedInData: true };
            }
          }

          const inner = data?.d?.data || data?.d || data?.data || data;
          if (inner && (inner.resources || inner.cars || inner.date_time || inner.car_models)) {
            return { profile: inner, response: res, isWrappedInD: !!data?.d, isWrappedInData: !!data?.data };
          }
        }
      } catch (e: any) {
        console.warn(`[PROFILE FETCH] Error on ${url}:`, e.message || e);
      }
    }

    return { profile: null, response: null, isWrappedInD: true, isWrappedInData: true };
  }

  static async getAuthState(token: string) {
    try {
      const response = await fetch(`${BASE_URL}/state`, {
        method: "GET",
        headers: {
          ...DEFAULT_HEADERS,
          "Authorization": fToken(token)
        }
      });
      if (response.status === 200 || response.status === 201) {
        const data = await response.json();
        return data.d || data;
      }
    } catch (e) {
      console.error("[AUTH STATE FETCH ERROR]", e);
    }
    return null;
  }

  static async fetchAndAttachProfileStats(result: any) {
    if (result.success && result.token) {
      try {
        console.log(`[FETCH STATS] Fetching profile & state for userId=${result.userId}`);
        const [profileResult, authState] = await Promise.all([
          CarXClient.getProfile(result.token, result.userId, result.deviceId, result.uniqueId),
          CarXClient.getAuthState(result.token)
        ]);
        const { profile } = profileResult;
        let stats: any;
        if (profile) {
          stats = extractProfileStats(profile, false);
        } else {
          // Fresh account that hasn't initialized profile on CarX server yet
          stats = {
            cash: 21000,
            silver: 21000,
            gold: 0,
            level: 1,
            exp: 0,
            xp: 0,
            name: null,
            avatar: null,
            lastUpdated: null,
            isVerified: false,
            isFallback: true,
            cars: 1,
            maps: 0,
            streetPass: false,
            premium: false
          };
        }
        if (authState) {
          stats.isVerified = !!authState.verified;
        }
        result.profileStats = stats;
        result.rawProfile = profile || null;
      } catch (e: any) {
        console.error("[PROFILE FETCH ERROR]", e.message || e);
      }
    }
  }

  // Upload profile using compressed_data payload with retry loop (matches python reference bot)
  static async uploadProfile(
    token: string,
    profile: any,
    userId?: string,
    getResponse?: any,
    isWrappedInD = true,
    isWrappedInData = false,
    deviceId?: string,
    uniqueId?: string,
    retries = 5
  ): Promise<{ success: boolean; response: any }> {
    const headers: Record<string, string> = {
      "User-Agent": "UnityPlayer/6000.0.64f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)",
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": fToken(token)
    };

    if (deviceId) {
      headers["Device-Id"] = deviceId;
      headers["X-Device-Id"] = deviceId;
    }
    if (uniqueId) {
      headers["Unique-Id"] = uniqueId;
      headers["X-Unique-Id"] = uniqueId;
      headers["Unip-Id"] = uniqueId;
      headers["X-Unip-Id"] = uniqueId;
      headers["UnipId"] = uniqueId;
      headers["X-UnipId"] = uniqueId;
    }

    const b64 = compressData(profile);
    const payload = JSON.stringify({ compressed_data: b64 });

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(`${GAME_BASE_URL}/profiles`, {
          method: "POST",
          headers,
          body: payload,
          signal: AbortSignal.timeout(20000)
        });

        if (res.status === 200 || res.status === 201 || res.status === 204) {
          console.log(`[PROFILE UPLOAD] Success on attempt ${attempt + 1}`);
          return { success: true, response: res };
        }
        console.warn(`[PROFILE UPLOAD] Attempt ${attempt + 1} returned status ${res.status}`);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e: any) {
        console.warn(`[PROFILE UPLOAD] Attempt ${attempt + 1} error:`, e.message || e);
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    return { success: false, response: null };
  }

  static async deleteAccount(token: string, email: string, pass: string) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      // Re-authenticate first to ensure we have a fresh, valid token
      console.log(`[DELETE ACCOUNT] Re-authenticating ${email} to ensure valid session...`);
      const authRes = await CarXClient.authenticate("login", email, pass);
      let activeToken = token;
      if (authRes.success && authRes.token) {
        activeToken = authRes.token;
        console.log(`[DELETE ACCOUNT] Fresh token obtained successfully.`);
      } else {
        console.log(`[DELETE ACCOUNT] Re-authentication failed: ${authRes.message}. Trying with provided token.`);
      }

      const headers = {
        ...DEFAULT_HEADERS,
        "Authorization": `Bearer ${activeToken}`,
        "Content-Type": "application/x-www-form-urlencoded"
      };
      const body = new URLSearchParams({
        username: email,
        password: pass
      });
      const response = await fetch(`${BASE_URL}/delete`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.status === 200 || response.status === 201) {
        return { success: true, message: "Account deleted successfully." };
      }
      return { success: false, message: await response.text() };
    } catch (e: any) {
      clearTimeout(timeoutId);
      return { success: false, message: e.message || "Failed to connect for deletion" };
    }
  }

  static async verifyStreetPass(token: string, bodyObj: any, deviceId?: string, uniqueId?: string) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const headers: Record<string, string> = {
          "Host": "street-prod.carx-online.com",
          "User-Agent": "UnityPlayer/6000.0.64f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)",
          "Accept": "*/*",
          "Accept-Encoding": "deflate, gzip",
          "Content-Type": "application/json",
          "Authorization": fToken(token),
          "X-Unity-Version": "6000.0.64f1"
        };
        if (deviceId) { headers["Device-Id"] = deviceId; headers["X-Device-Id"] = deviceId; }
        if (uniqueId) {
          headers["Unique-Id"] = uniqueId;
          headers["X-Unique-Id"] = uniqueId;
          headers["Unip-Id"] = uniqueId;
          headers["X-Unip-Id"] = uniqueId;
          headers["UnipId"] = uniqueId;
          headers["X-UnipId"] = uniqueId;
        }
        const response = await fetch(`${GAME_BASE_URL}/purchases/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyObj),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const bodyText = await response.text().catch(() => "");
        if (response.status === 200 || response.status === 201) {
          return true;
        }
        if ([500, 502, 503, 504, 429].includes(response.status) && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 200));
          continue;
        }
        console.warn(`[STREETPASS VERIFY ERROR] status=${response.status} body=${bodyText}`);
        return false;
      } catch (e: any) {
        clearTimeout(timeoutId);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 200));
          continue;
        }
        console.warn(`[STREETPASS VERIFY ERROR] error=${e.message || e}`);
        return false;
      }
    }
    return false;
  }

  static async unlockPremium(token: string, deviceId?: string, uniqueId?: string) {
    const skrg = new Date();
    const end_iso = new Date(skrg.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const headers: Record<string, string> = {
      "Host": "street-prod.carx-online.com",
      "User-Agent": "UnityPlayer/6000.0.64f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)",
      "Accept": "*/*",
      "Accept-Encoding": "deflate, gzip",
      "Content-Type": "application/json",
      "Authorization": fToken(token),
      "X-Unity-Version": "6000.0.64f1"
    };

    if (deviceId) { headers["Device-Id"] = deviceId; headers["X-Device-Id"] = deviceId; }
    if (uniqueId) {
      headers["Unique-Id"] = uniqueId;
      headers["X-Unique-Id"] = uniqueId;
      headers["Unip-Id"] = uniqueId;
      headers["X-Unip-Id"] = uniqueId;
      headers["UnipId"] = uniqueId;
      headers["X-UnipId"] = uniqueId;
    }

    const store_headers: Record<string, string> = {
      "Host": "carx-store.com",
      "User-Agent": "UnityPlayer/6000.0.64f1 (UnityWebRequest/1.0, libcurl/8.10.1-DEV)",
      "Accept": "*/*",
      "Content-Type": "application/json",
      "Authorization": fToken(token),
      "X-Unity-Version": "6000.0.64f1"
    };

    const premiumPurchaseId = process.env.PREMIUM_PURCHASE_ID || "GPA.3300-9384-4790-70667";
    const premiumPurchaseToken = process.env.PREMIUM_PURCHASE_TOKEN || "eeoldhlponplckhkmghkbnbh.AO-J1Oz0GmoQuAe5OWrshC5AsawwFRMyVvQdwzz2ovPDkPj29SuvBnAPbKkGvchP0b-3pDrr3BnluedswSEHqcG_GHS4fiCC7w";
    const premiumSignature = process.env.PREMIUM_SIGNATURE || "pktPXa9uIJ4CnoLsDDEdRmsqzADuxwwp9eMHSMnoTlcT+M9JdDWb3v4EwEpnOOKaK+WULjY8ZvNza+mFvvV2MnEFZu0YtTWdroBr1S9T//bsLhO9UIV8C+CEtQeruoGnTGgHfONNeUuJkfgVFUZqc8stlibEWCRhn2gaCco6PoEcfk9WTbjSKEu7XKmj8+2sGiMK+no2uK7WunfMIhos1p53BT38ryo30BkSZKi/9xCenP5AUHPIzkf6ZbhGbIrbSFqbbhn5rHs1w6FuIRGtz2Ivr+j8zmJ3Gz0BlsuSsLYoCvs3qFxIsSD+HNkhs1mh0UIlYi4gL9htww1rKSk3pg==";
    const premiumPurchaseTime = process.env.PREMIUM_PURCHASE_TIME ? parseInt(process.env.PREMIUM_PURCHASE_TIME, 10) : 1780240284277;

    const verify_payload = {
      "gameVersion": "1.20.0",
      "purchaseId": premiumPurchaseId,
      "productId": "com.carxtech.sr.bank.prem.30day",
      "transactionData": premiumPurchaseToken,
      "transactionId": premiumPurchaseToken,
      "subscription": true,
      "metaInfo": JSON.stringify({
        "json": JSON.stringify({
          "orderId": premiumPurchaseId,
          "packageName": "com.carxtech.sr",
          "productId": "com.carxtech.sr.bank.prem.30day",
          "purchaseTime": premiumPurchaseTime,
          "purchaseState": 0,
          "purchaseToken": premiumPurchaseToken,
          "quantity": 1,
          "autoRenewing": true,
          "acknowledged": false
        }),
        "signature": premiumSignature,
        "skuDetails": [JSON.stringify({
          "productId": "com.carxtech.sr.bank.prem.30day",
          "type": "subs",
          "title": "Premium 30 days (CarX Street)",
          "name": "Premium 30 days",
          "description": "",
          "price": "$5.99",
          "price_amount_micros": 5990000,
          "price_currency_code": "USD",
          "subscriptionPeriod": "P1M"
        })]
      }),
      "marketType": "GOOGLE",
      "productType": 2
    };

    const receive_payload = {
      "purchaseId": premiumPurchaseId,
      "productId": "com.carxtech.sr.bank.prem.30day",
      "transactionId": premiumPurchaseToken,
      "marketType": "GOOGLE",
      "productType": 2
    };

    try {
      // Step 1: Trigger Verify
      console.log("[PREMIUM] Step 1: purchases/verify");
      const resVerify = await fetch(`${GAME_BASE_URL}/purchases/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify(verify_payload)
      });
      const verifyText = await resVerify.text().catch(() => "");
      console.log(`[PREMIUM] Verify status: ${resVerify.status}, body: ${verifyText}`);

      // Step 2: Receive purchase
      console.log("[PREMIUM] Step 2: purchases/receive");
      const resReceive = await fetch(`${GAME_BASE_URL}/purchases/receive`, {
        method: "POST",
        headers,
        body: JSON.stringify(receive_payload)
      });
      const receiveText = await resReceive.text().catch(() => "");
      console.log(`[PREMIUM] Receive status: ${resReceive.status}, body: ${receiveText}`);

      // Step 3: Probe store catalog
      console.log("[PREMIUM] Step 3: carx-store.com items");
      const resStore = await fetch("https://carx-store.com/api/v1/mobile/str/items", {
        method: "GET",
        headers: store_headers
      });
      const storeText = await resStore.text().catch(() => "");
      console.log(`[PREMIUM] Store status: ${resStore.status}, body: ${storeText.substring(0, 200)}`);

      // Step 4: Get remote rewards
      console.log("[PREMIUM] Step 4: remote/rewards");
      const resRewards = await fetch(`${GAME_BASE_URL}/remote/rewards`, {
        method: "GET",
        headers
      });
      const rewardsText = await resRewards.text().catch(() => "{}");
      console.log(`[PREMIUM] Rewards status: ${resRewards.status}`);

      let claimedCount = 0;
      try {
        const rewardsData = JSON.parse(rewardsText);
        const rewards = rewardsData?.d?.rewards || [];
        if (Array.isArray(rewards) && rewards.length > 0) {
          console.log(`[PREMIUM] Found ${rewards.length} rewards. Claiming...`);
          // Step 5: Claim each reward
          for (const rw of rewards) {
            const rewardId = rw.id || rw.rewardId;
            if (rewardId) {
              const resClaim = await fetch(`${GAME_BASE_URL}/remote/rewards/receive_reward`, {
                method: "POST",
                headers,
                body: JSON.stringify({ rewardId })
              });
              await resClaim.text().catch(() => "");
              if (resClaim.status === 200 || resClaim.status === 201) {
                claimedCount++;
              }
            }
          }
        }
      } catch (e: any) {
        console.warn(`[PREMIUM] Error processing rewards: ${e.message}`);
      }

      if (resVerify.status === 200 || resVerify.status === 201 || resReceive.status === 200 || resReceive.status === 201) {
        return { success: true, expired: end_iso };
      }

      return {
        success: false,
        message: `Premium Activation Failed. Verify: ${resVerify.status}, Receive: ${resReceive.status}.`
      };
    } catch (e: any) {
      console.warn(`[PREMIUM UNLOCK ERROR] error=${e.message || e}`);
      return { success: false, message: e.message || "Failed to connect for premium activation" };
    }
  }
}

function fToken(token: string) {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

export function modifyProfile(base: any, mods: {
  cash?: number;
  gold?: number;
  level?: number;
  exp?: number;
  unlock_clubs?: boolean;
  get_all_cars?: boolean;
  safe_repair?: boolean;
  unlock_houses?: boolean;
  unlock_profile_style?: boolean;
  inject_car?: string;
  avatar?: string;
  banner?: string;
  frame?: string;
  random_cars_count?: number;
  inject_cars?: string[];
}, userId?: string) {
  let profile: any;
  // isFresh: use template as structural base when profile has no top-level resources.
  // The template structure is required for the game to load properly.
  // We fix the value overwrite problem separately in the resources seeding below.
  const isFresh = !base || Object.keys(base).length === 0 || !base.resources;

  // Extract real player values BEFORE potentially replacing the base with the template.
  // This preserves the player's actual cash/gold/level/exp when the profile structure
  // needs the template as a base (e.g. resources stored in a nested path).
  const existingStats = (base && Object.keys(base).length > 0) ? extractProfileStats(base, false) : null;

  if (mods.safe_repair || isFresh) {
    profile = structuredClone(PROFILE_TEMPLATE || {});
  } else {
    profile = structuredClone(base);
  }

  profile.date_time = new Date().toISOString().replace("T", " ").substring(0, 19);

  // Removed user ID fields injection at root level of profile to prevent game client JSON deserialization errors/crashes


  // Ensure inner resources exist.
  if (!profile.resources) {
    profile.resources = PROFILE_TEMPLATE ? structuredClone(PROFILE_TEMPLATE.resources) : {
      soft: { amount: 0 },
      hard: { amount: 0 },
      experience: { award_index: 1, amount: 0 }
    };
  }
  if (!profile.resources.soft) profile.resources.soft = { amount: 0 };
  if (!profile.resources.hard) profile.resources.hard = { amount: 0 };
  if (!profile.resources.experience) profile.resources.experience = { award_index: 1, amount: 0 };

  // If we used the template as a base for a real (non-repair) account, restore the
  // player's actual resource values so we don't overwrite them with template defaults.
  // If no existingStats is available (truly fresh account), use starter values (21000 cash, 0 gold, level 1, 0 exp).
  if (isFresh && !mods.safe_repair) {
    const defaultCash = (existingStats && existingStats.cash > 0) ? existingStats.cash : 21000;
    const defaultGold = existingStats ? existingStats.gold : 0;
    const defaultExp = existingStats ? existingStats.exp : 0;
    const defaultLevel = existingStats ? existingStats.level : 1;

    if (mods.cash === undefined) {
      profile.resources.soft.amount = defaultCash;
    }
    if (mods.gold === undefined) {
      profile.resources.hard.amount = defaultGold;
    }
    if (mods.exp === undefined) {
      profile.resources.experience.amount = defaultExp;
    }
    if (mods.level === undefined) {
      profile.resources.experience.award_index = defaultLevel;
    }
  }

  // Soft/Cash
  if (mods.cash !== undefined) {
    let cashVal = mods.cash;
    if (cashVal > 2140000000) cashVal = 2140000000;
    profile.resources.soft.amount = cashVal;
  }
  // Hard/Gold
  if (mods.gold !== undefined) {
    let goldVal = parseFloat(mods.gold as any);
    if (goldVal > 2140000000) goldVal = 2140000000;
    profile.resources.hard.amount = goldVal;
  }
  // Level & XP
  if (mods.level !== undefined) {
    profile.resources.experience.award_index = mods.level;
  }
  if (mods.exp !== undefined) {
    profile.resources.experience.amount = mods.exp;
  }

  // Initialize all 22 game clubs to avoid UI "undefined" crashes
  const allClubs = [
    "club_burnout_rangers", "club_black_lotus", "club_arctic_outlaws",
    "club_speedstar_energy", "club_grip_masters", "club_chimeras", "club_savage",
    "club_hyper_sonic", "club_spitfire", "club_drift_united", "club_falcons_outlaws",
    "club_pitons", "club_pythons", "club_speedline_syndicate", "club_streethunters",
    "club_white_tigers", "club_21_tribe", "club_road_runner", "club_western_sierra",
    "club_wild_juniors", "club_union_underground", "club_kanjo_spirit"
  ];

  profile.clubs = profile.clubs || {};
  allClubs.forEach(club => {
    profile.clubs[club] = profile.clubs[club] || {};
    profile.clubs[club].cars = profile.clubs[club].cars || {};
    profile.clubs[club].available_races = profile.clubs[club].available_races || {};
    profile.clubs[club].complete_races = profile.clubs[club].complete_races || {};
    profile.clubs[club].car_statistics = profile.clubs[club].car_statistics || {};

    if (mods.unlock_clubs) {
      profile.clubs[club].club_completed = true;
      profile.clubs[club].reward_collected = false;
    } else if (isFresh || mods.safe_repair) {
      profile.clubs[club].club_completed = false;
      profile.clubs[club].reward_collected = false;
      profile.clubs[club].complete_races = {};
    }
  });

  // Automatically complete all intro quests only if unlocking all/cars/houses or fresh/repair
  if (mods.get_all_cars || mods.unlock_houses || isFresh || mods.safe_repair) {
    profile.quests = profile.quests || {};
    const introQuests = [
      "car_choice_intro", "move_to_apartment_intro_quest",
      "move_to_gasstation_intro_quest", "move_to_tuning_intro_quest",
      "move_to_club_intro_quest"
    ];
    introQuests.forEach(q => {
      profile.quests[q] = profile.quests[q] || {};
      profile.quests[q].completed = true;
      profile.quests[q].rewarded = true;
      profile.quests[q].trigger = profile.quests[q].trigger || {};
    });
  }

  // Cars injection & real estate slot mapping
  const isInjectingCars = !!(mods.get_all_cars || mods.regular_cars || mods.premium_cars || mods.cars_package);
  const carPackage = mods.regular_cars ? "regular" : (mods.premium_cars ? "premium" : (mods.cars_package || "premium"));

  if (isInjectingCars) {
    console.log(`[MODIFY PROFILE] Injecting cars package (${carPackage})...`);
    const carsToAdd = carPackage === "regular" ? getRegularCarData((mods as any)._db) : getPremiumCarData((mods as any)._db);
    const { added, skipped } = implantCarsProfile(profile, carsToAdd);
    console.log(`[MODIFY PROFILE] implantCarsProfile added=${added}, skipped=${skipped.length}`);

    if (mods.unlock_houses || isInjectingCars) {
      unlockMapsUltimate(profile);
    }
  } else {
    // If not injecting car packages, check if fresh profile needs starter Supra
    if (isFresh || mods.safe_repair) {
      const carsItems = profile.cars?.items || {};
      if (Object.keys(carsItems).length === 0) {
        const supra = makeCarEntry("toyotasupra2020", "1001");
        profile.cars = { seed: 1002, items: { "1001": supra } };
        profile.car_models = { keys: ["1001"], values: ["toyotasupra2020"] };
        profile.current_car_id = 1001;
      }
    }

    if (mods.unlock_houses) {
      unlockMapsUltimate(profile);
    } else {
      ensureRealEstateSlotsForCars(profile);
    }
  }

  // ── Unlock Profile Style (all avatars, banners, frames, emojis, and plates) ──
  if (mods.unlock_profile_style) {
    profile.battle_pass_event_rewards = profile.battle_pass_event_rewards || {};
    profile.battle_pass_event_rewards.keys = profile.battle_pass_event_rewards.keys || [];

    // Ensure all 16 avatars, 16 banners, 16 frames, and 4 emojis are present in battle_pass_event_rewards.keys
    for (let i = 1; i <= 16; i++) {
      if (!profile.battle_pass_event_rewards.keys.includes(`unlock_avatar_${i}`)) profile.battle_pass_event_rewards.keys.push(`unlock_avatar_${i}`);
      if (!profile.battle_pass_event_rewards.keys.includes(`unlock_banner_${i}`)) profile.battle_pass_event_rewards.keys.push(`unlock_banner_${i}`);
      if (!profile.battle_pass_event_rewards.keys.includes(`unlock_frame_${i}`)) profile.battle_pass_event_rewards.keys.push(`unlock_frame_${i}`);
    }
    for (let i = 1; i <= 4; i++) {
      if (!profile.battle_pass_event_rewards.keys.includes(`unlock_emoji_${i}`)) profile.battle_pass_event_rewards.keys.push(`unlock_emoji_${i}`);
    }

    // Copy the valid keys from the template, strictly filtering to match: 16 avatars, 16 banners, 16 frames, 4 quick chats
    if (PROFILE_TEMPLATE && PROFILE_TEMPLATE.battle_pass_event_rewards && PROFILE_TEMPLATE.battle_pass_event_rewards.keys) {
      const templateKeys = PROFILE_TEMPLATE.battle_pass_event_rewards.keys;
      for (const key of templateKeys) {
        const avatarMatch = key.match(/^unlock_avatar_(\d+)$/i);
        const bannerMatch = key.match(/^unlock_banner_(\d+)$/i);
        const frameMatch = key.match(/^unlock_frame_(\d+)$/i);
        const emojiMatch = key.match(/^unlock_emoji_(\d+)$/i);

        if (avatarMatch && parseInt(avatarMatch[1], 10) > 16) continue;
        if (bannerMatch && parseInt(bannerMatch[1], 10) > 16) continue;
        if (frameMatch && parseInt(frameMatch[1], 10) > 16) continue;
        if (emojiMatch && parseInt(emojiMatch[1], 10) > 4) continue;

        if (!profile.battle_pass_event_rewards.keys.includes(key)) {
          profile.battle_pass_event_rewards.keys.push(key);
        }
      }
    }

    // Ensure the active emojis map has exactly 4 active slots (prevents loading freeze)
    profile.emoji = {
      keys: ["0", "1", "2", "3"],
      values: ["emoji_1", "emoji_2", "emoji_3", "emoji_4"]
    };

    // Ensure active profile styling defaults to target ID 15 if not specified
    profile.profile = profile.profile || {};
    profile.profile.avatar = mods.avatar || profile.profile.avatar || "avatar_15";
    profile.profile.banner = mods.banner || profile.profile.banner || "banner_15";
    profile.profile.frame = mods.frame || profile.profile.frame || "frame_15";
  }

  // ── Active Avatar/Banner/Frame Selection ──
  if (mods.avatar || mods.banner || mods.frame) {
    profile.profile = profile.profile || {};
    if (mods.avatar) {
      const index = parseInt(mods.avatar.replace(/\D/g, ""), 10);
      if (index <= 16) profile.profile.avatar = mods.avatar;
    }
    if (mods.banner) {
      const index = parseInt(mods.banner.replace(/\D/g, ""), 10);
      if (index <= 16) profile.profile.banner = mods.banner;
    }
    if (mods.frame) {
      const index = parseInt(mods.frame.replace(/\D/g, ""), 10);
      if (index <= 16) profile.profile.frame = mods.frame;
    }
  }

  // ── Single Car Injection ──
  if (mods.inject_car) {
    console.log(`[MODIFY PROFILE] Injecting single car: ${mods.inject_car}...`);
    const allCars = { ...getPremiumCarData((mods as any)._db), ...getRegularCarData((mods as any)._db) };
    let carTemplateObj: any = null;
    for (const cid of Object.keys(allCars)) {
      if (allCars[cid]?.__desc_id === mods.inject_car) {
        carTemplateObj = structuredClone(allCars[cid]);
        break;
      }
    }
    if (!carTemplateObj) {
      carTemplateObj = makeCarEntry(mods.inject_car, "1001");
    }
    const singleDict: Record<string, any> = { "1001": carTemplateObj };
    implantCarsProfile(profile, singleDict);
  }

  // ── Multiple Cars Injection ──
  if (mods.inject_cars && Array.isArray(mods.inject_cars) && mods.inject_cars.length > 0) {
    console.log(`[MODIFY PROFILE] Injecting multiple cars: ${mods.inject_cars.join(", ")}...`);
    const allCars = { ...getPremiumCarData((mods as any)._db), ...getRegularCarData((mods as any)._db) };
    const toInject: Record<string, any> = {};
    for (let i = 0; i < mods.inject_cars.length; i++) {
      const carModel = mods.inject_cars[i];
      let carObj: any = null;
      for (const cid of Object.keys(allCars)) {
        if (allCars[cid]?.__desc_id === carModel) {
          carObj = structuredClone(allCars[cid]);
          break;
        }
      }
      if (!carObj) {
        carObj = makeCarEntry(carModel, (1001 + i).toString());
      }
      toInject[(1001 + i).toString()] = carObj;
    }
    implantCarsProfile(profile, toInject);
  }

  // ── Inject Custom Amount of Random Cars ──
  if (mods.random_cars_count && mods.random_cars_count > 0) {
    console.log(`[MODIFY PROFILE] Injecting ${mods.random_cars_count} random cars...`);
    const pool = { ...getPremiumCarData((mods as any)._db), ...getRegularCarData((mods as any)._db) };
    const poolEntries = Object.entries(pool);
    if (poolEntries.length > 0) {
      const count = Math.min(mods.random_cars_count, poolEntries.length);
      const shuffled = [...poolEntries].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, count);
      const selectedDict: Record<string, any> = {};
      selected.forEach(([k, v], idx) => {
        selectedDict[(1001 + idx).toString()] = v;
      });
      implantCarsProfile(profile, selectedDict);
    }
  }

  injectNewBoxesAndAntiGhost(profile);
  return profile;
}

// Default features supported by RYOMENX STORE CONTROLLER keys
const DEFAULT_FEATURES = [
  "cash_gold",
  "level_xp",
  "unlock_clubs",
  "get_all_cars",
  "safe_repair",
  "battlepass",
  "streetpass_ep",
  "bulk_generate",
  "premium"
];

// Helper to check and deduct credits and check feature gates
async function checkAndDeductCredit(licenseKey: string, role: string, feature: string, creditCost = 1) {
  if (role === "owner" || licenseKey === OWNER_KEY) {
    return { success: true, credits: -1 };
  }

  const db = await loadKeysDb();
  const keyData = db.keys[licenseKey];
  if (!keyData) {
    return { success: false, message: "Invalid license key session." };
  }

  if (feature !== "bypass_check") {
    const enabledFeatures = keyData.enabled_features || DEFAULT_FEATURES;
    if (!enabledFeatures.includes(feature)) {
      return { success: false, message: `Access Denied: The "${feature}" feature is not unlocked for your license key.` };
    }
  }

  const credits = getKeyCredits(keyData);
  if (credits !== -1) {
    if (credits <= 0) {
      keyData.out_of_credits = true;
      saveKeysDb(db); // fire-and-forget
      return { success: false, message: "Out of Credits. Please DM Telegram @ryomenx1 to buy more credits." };
    }
    if (credits < creditCost) {
      return { success: false, message: `Insufficient Credits: This action costs ${creditCost} credit(s), but you only have ${credits} credit(s) remaining. Please DM Telegram @ryomenx1 to buy more credits.` };
    }
  }

  return { success: true, keyData, db };
}

async function getRemainingCreditsGlobal(licenseKey: string, role: string) {
  if (role === "owner" || licenseKey === OWNER_KEY) return -1;
  const db = await loadKeysDb();
  return getKeyCredits(db.keys[licenseKey]);
}

// API ROUTE HANDLERS

// License Verification
app.post(["/api/verify-license", "/verify-license", "/api/auth/verify", "/auth/verify"], async (req, res) => {
  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, error: "License key is required.", message: "License key is required." });
  }

  const cleanKey = key.trim();
  const lowerKey = cleanKey.toLowerCase();

  // Check owner key or admin key (case-insensitive)
  if (lowerKey === (OWNER_KEY || "").toLowerCase() || lowerKey === "admin-mingfu" || lowerKey === "rmx_carx_ryomen_add") {
    return res.json({
      success: true,
      role: "admin",
      token: cleanKey,
      message: "Owner access granted.",
      expiry: "Unlimited/Lifetime",
      expires_at: null,
      ...creditResponse(-1),
      enabled_features: DEFAULT_FEATURES
    });
  }

  const db = await loadKeysDb();

  // Check key (with case-insensitive fallback)
  let matchingKey = cleanKey;
  if (!db.keys[cleanKey]) {
    const foundKey = Object.keys(db.keys).find(k => k.toLowerCase() === lowerKey);
    if (foundKey) {
      matchingKey = foundKey;
    } else {
      return res.status(401).json({ success: false, error: "Invalid key", message: "Invalid license key." });
    }
  }

  const keyData = db.keys[matchingKey];
  const now = Date.now() / 1000;

  if (keyData.expires_at && now > keyData.expires_at) {
    return res.status(401).json({ success: false, error: "Key expired", message: "This key has expired." });
  }

  const maxClaims = keyData.max_claims || 1;
  const claimedUsers = keyData.claimed_users || [];

  // Prune any expired sessions from db.authorized_users and claimedUsers
  let activeClaims: string[] = [];
  for (const token of claimedUsers) {
    const session = db.authorized_users[token];
    if (session) {
      if (session.expires_at && now > session.expires_at) {
        delete db.authorized_users[token];
      } else {
        activeClaims.push(token);
      }
    }
  }

  // Evict oldest session tokens if they exceed the maxClaims limit
  while (activeClaims.length >= maxClaims) {
    const oldestToken = activeClaims.shift();
    if (oldestToken) {
      delete db.authorized_users[oldestToken];
    }
  }

  // Generate a random user session ID
  const sessionToken = crypto.randomUUID();
  activeClaims.push(sessionToken);

  keyData.claimed_users = activeClaims;
  keyData.claimed_by = activeClaims[0] || null;
  db.authorized_users[sessionToken] = {
    key: cleanKey,
    expires_at: keyData.expires_at
  };

  await saveKeysDb(db);

  const credits = getKeyCredits(keyData);
  res.json({
    success: true,
    role: keyData.type || "user",
    token: sessionToken,
    sessionToken,
    ...creditResponse(credits),
    enabled_features: keyData.enabled_features || DEFAULT_FEATURES,
    message: "Access granted successfully.",
    expiry: keyData.expires_at ? new Date(keyData.expires_at * 1000).toLocaleString() : "Unlimited/Lifetime",
    expires_at: keyData.expires_at || null,
    out_of_credits: isOutOfCredits(keyData)
  });
});

// Admin Check Middleware
async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const sessionToken = (req.headers["authorization"]?.replace("Bearer ", "") || req.query.adminToken || (req.body && req.body.adminToken)) as string;
  if (!sessionToken) {
    return res.status(401).json({ success: false, message: "Unauthorized. Session token missing." });
  }

  const cleanToken = sessionToken.trim();
  const lowerToken = cleanToken.toLowerCase();

  if (cleanToken === OWNER_KEY || lowerToken === (OWNER_KEY || "").toLowerCase() || lowerToken === "admin-mingfu" || lowerToken === "rmx_carx_ryomen_add") {
    (req as any).role = "admin";
    (req as any).licenseKey = cleanToken;
    (req as any).sessionToken = cleanToken;
    return next();
  }

  const db = await loadKeysDb();
  const user = db.authorized_users[cleanToken];
  if (!user) {
    // Check if key is direct admin key in db.keys
    if (db.keys && db.keys[cleanToken] && (db.keys[cleanToken].type === "admin" || db.keys[cleanToken].type === "owner")) {
      (req as any).role = "admin";
      (req as any).licenseKey = cleanToken;
      (req as any).sessionToken = cleanToken;
      return next();
    }
    return res.status(401).json({ success: false, message: "Session invalid or expired." });
  }

  const keyData = db.keys[user.key];
  if (!keyData) {
    return res.status(401).json({ success: false, message: "Associated license key no longer exists." });
  }

  const now = Date.now() / 1000;
  if (keyData.expires_at && now > keyData.expires_at) {
    return res.status(401).json({ success: false, message: "Your license key has expired." });
  }

  if (user.expires_at && now > user.expires_at) {
    return res.status(401).json({ success: false, message: "Session has expired." });
  }

  (req as any).role = keyData.type || "user";
  (req as any).sessionToken = sessionToken;
  (req as any).licenseKey = user.key;
  next();
}

// Lightweight session sync — does not mint a new session token
app.get(["/api/session/balance", "/session/balance"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  const licenseKey = (req as any).licenseKey;

  if (role === "owner" || licenseKey === OWNER_KEY) {
    return res.json({
      success: true,
      role: "owner",
      ...creditResponse(-1),
      enabled_features: DEFAULT_FEATURES,
      expiry: "Unlimited/Lifetime",
      expires_at: null
    });
  }

  const db = await loadKeysDb();
  const keyData = db.keys[licenseKey];
  if (!keyData) {
    return res.status(401).json({ success: false, message: "Associated license key no longer exists." });
  }

  const credits = getKeyCredits(keyData);
  return res.json({
    success: true,
    role: keyData.type || "user",
    ...creditResponse(credits),
    enabled_features: keyData.enabled_features || DEFAULT_FEATURES,
    expiry: keyData.expires_at ? new Date(keyData.expires_at * 1000).toLocaleString() : "Unlimited/Lifetime",
    expires_at: keyData.expires_at || null,
    out_of_credits: isOutOfCredits(keyData)
  });
});

app.post(["/api/auth/session", "/auth/session"], async (req, res) => {
  const token = req.body.token || req.headers["authorization"]?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ success: false, message: "Session token missing" });
  }

  if (token === OWNER_KEY || token === "admin-mingfu" || token === "RMX_CARX_RYOMEN_ADD") {
    return res.json({ role: "admin", token });
  }

  const db = await loadKeysDb();
  const user = db.authorized_users[token];
  if (user) {
    const keyData = db.keys[user.key];
    const role = (keyData?.type === "admin" || keyData?.type === "owner") ? "admin" : "user";
    return res.json({ role, token });
  }

  return res.status(401).json({ success: false, message: "Invalid session" });
});

// Get cars list (189 cars)
app.get(["/api/cars", "/cars"], (req, res) => {
  res.json({
    success: true,
    total: ALL_CAR_MODELS.length,
    cars: ALL_CAR_MODELS.map((descId, idx) => ({
      id: (1001 + idx).toString(),
      descId
    }))
  });
});

// Admin strings config
app.get(["/api/admin/strings", "/admin/strings"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden." });
  }
  const db = await loadKeysDb(true);
  const regCars = getRegularCarData(db);
  const premCars = getPremiumCarData(db);

  res.json({
    success: true,
    regular_cars_string: db.custom_regular_cars_string || "",
    regularCarsString: db.custom_regular_cars_string || "",
    premium_cars_string: db.custom_premium_cars_string || db.custom_cars_string || "",
    premiumCarsString: db.custom_premium_cars_string || db.custom_cars_string || "",
    cars_string: db.custom_premium_cars_string || db.custom_cars_string || "",
    carsString: db.custom_premium_cars_string || db.custom_cars_string || "",
    blueprint_string: db.custom_blueprint_string || "",
    blueprintString: db.custom_blueprint_string || "",
    car_count: Object.keys(regCars).length,
    premium_car_count: Object.keys(premCars).length,
    blueprint_loaded: !!(db.custom_blueprint_string || PROFILE_TEMPLATE),
    updatedAt: db.strings_updated_at || Date.now()
  });
});

app.post(["/api/admin/strings", "/admin/strings"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden." });
  }
  const {
    regular_cars_string,
    regularCarsString,
    premium_cars_string,
    premiumCarsString,
    cars_string,
    carsString,
    blueprint_string,
    blueprintString
  } = req.body;

  const db = await loadKeysDb(true);

  const regInput = (regular_cars_string ?? regularCarsString)?.trim();
  if (regInput !== undefined) {
    if (regInput === "" || regInput.toLowerCase() === "clear" || regInput.toLowerCase() === "default") {
      delete db.custom_regular_cars_string;
    } else {
      const extracted = extractCarsFromFileContent(regInput);
      if (!extracted || Object.keys(extracted).length === 0) {
        return res.status(400).json({ success: false, message: "Invalid regular cars data - no valid cars found." });
      }
      db.custom_regular_cars_string = compressData({ cars: { items: extracted, seed: 1000 } });
    }
    _cachedRegularCars = null;
    _cachedRegularCarsSrc = "";
  }

  const premInput = (premium_cars_string ?? premiumCarsString ?? cars_string ?? carsString)?.trim();
  if (premInput !== undefined) {
    if (premInput === "" || premInput.toLowerCase() === "clear" || premInput.toLowerCase() === "default") {
      delete db.custom_premium_cars_string;
      delete db.custom_cars_string;
    } else {
      const extracted = extractCarsFromFileContent(premInput);
      if (!extracted || Object.keys(extracted).length === 0) {
        return res.status(400).json({ success: false, message: "Invalid premium cars data - no valid cars found." });
      }
      const compressed = compressData({ cars: { items: extracted, seed: 1000 } });
      db.custom_premium_cars_string = compressed;
      db.custom_cars_string = compressed;
    }
    _cachedPremiumCars = null;
    _cachedPremiumCarsSrc = "";
  }

  const bpInput = (blueprint_string ?? blueprintString)?.trim();
  if (bpInput !== undefined) {
    if (bpInput === "" || bpInput.toLowerCase() === "clear" || bpInput.toLowerCase() === "default") {
      delete db.custom_blueprint_string;
    } else {
      const decompressed = decompressData(bpInput);
      if (!decompressed || typeof decompressed !== "object") {
        return res.status(400).json({ success: false, message: "Invalid blueprint data - unable to parse or decompress." });
      }
      db.custom_blueprint_string = compressData(decompressed);
    }
  }

  db.strings_updated_at = Date.now();
  await saveKeysDb(db);

  const regCars = getRegularCarData(db);
  const premCars = getPremiumCarData(db);

  res.json({
    success: true,
    message: "Strings updated successfully.",
    regular_cars_string: db.custom_regular_cars_string || "",
    regularCarsString: db.custom_regular_cars_string || "",
    premium_cars_string: db.custom_premium_cars_string || db.custom_cars_string || "",
    premiumCarsString: db.custom_premium_cars_string || db.custom_cars_string || "",
    cars_string: db.custom_premium_cars_string || db.custom_cars_string || "",
    carsString: db.custom_premium_cars_string || db.custom_cars_string || "",
    blueprint_string: db.custom_blueprint_string || "",
    blueprintString: db.custom_blueprint_string || "",
    car_count: Object.keys(regCars).length,
    premium_car_count: Object.keys(premCars).length,
    updatedAt: db.strings_updated_at
  });
});

// ============================================================
// CARX ACCOUNT DATA EXTRACTOR (Full Account, 19 Parts & Multi-Part Extraction)
// ============================================================
export const ACCOUNT_EXTRACT_PARTS: Record<string, { path: string; desc: string }> = {
  cars: { path: "cars.items", desc: "All cars in garage" },
  maps: { path: "game_world_parts", desc: "Unlocked maps" },
  resources: { path: "resources", desc: "Silver, gold, XP" },
  premium: { path: "has_premium", desc: "Street Pass status" },
  stats: { path: "statistics", desc: "Player statistics" },
  quests: { path: "quests", desc: "Quest progress" },
  achievements: { path: "achievements", desc: "Achievements" },
  business: { path: "business_car_deliveries_completed", desc: "Business progress" },
  tuning: { path: "tuning", desc: "Tuning parts" },
  styling: { path: "styling", desc: "Visual items" },
  friends: { path: "friends", desc: "Friend list" },
  real_estates: { path: "real_estates", desc: "Properties" },
  shop_packs: { path: "shop_owned_packs", desc: "Shop packs" },
  unlocks: { path: "unlocks", desc: "Unlocked content" },
  battle_pass: { path: "battle_pass_event_rewards", desc: "Battle pass" },
  locations: { path: "locations", desc: "All locations" },
  clubs: { path: "clubs", desc: "All clubs" },
  slots: { path: "real_estate_slots", desc: "Garage slots" },
  races: { path: "race_generators", desc: "Race generators" },
  blueprint: { path: "", desc: "Complete account blueprint" },
  full: { path: "", desc: "Full account profile" }
};

function getNestedProperty(data: any, path: string): any {
  if (!path) return data;
  const keys = path.split(".");
  let cur = data;
  for (const k of keys) {
    if (cur && typeof cur === "object" && k in cur) {
      cur = cur[k];
    } else {
      return null;
    }
  }
  return cur;
}

// Account Profile Extractor Endpoint (Login + Extract Profile String / JSON)
app.post(["/api/carx/extract", "/carx/extract"], authMiddleware, async (req, res) => {
  const { email, password, format, target, targets } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required to extract profile." });
  }

  try {
    const authRes = await CarXClient.authenticate("login", email, password);
    if (!authRes.success || !authRes.token) {
      return res.status(401).json({ success: false, message: authRes.message || "Failed to log in to CarX account." });
    }

    const { token, userId, deviceId, uniqueId } = authRes;
    const profileRes = await CarXClient.getProfile(token, userId, deviceId, uniqueId);
    if (!profileRes || !profileRes.profile) {
      return res.status(400).json({ success: false, message: "Failed to download account profile from CarX servers." });
    }

    const rawProfile = profileRes.profile;
    const carsMap = extractCarsFromObject(rawProfile) || {};
    const totalCarsCount = Object.keys(carsMap).length || (rawProfile.cars?.items ? Object.keys(rawProfile.cars.items).length : 0);
    const stats = extractProfileStats(rawProfile, false);

    // Multi-part extraction support
    if (Array.isArray(targets) && targets.length > 0) {
      const extractedParts: Record<string, any> = {};
      const compressedParts: Record<string, string> = {};

      for (const partKey of targets) {
        const meta = ACCOUNT_EXTRACT_PARTS[partKey];
        if (meta) {
          const val = meta.path ? getNestedProperty(rawProfile, meta.path) : rawProfile;
          if (val !== null && val !== undefined) {
            extractedParts[partKey] = val;
            compressedParts[partKey] = compressData(val);
          }
        }
      }

      return res.json({
        success: true,
        message: `Extracted ${Object.keys(extractedParts).length} part(s) successfully! (${totalCarsCount} cars in garage)`,
        email,
        totalCars: totalCarsCount,
        stats,
        parts: extractedParts,
        compressedParts,
        rawProfile
      });
    }

    // Single target extraction
    const selectedTarget = target || "full";
    let extractedData = rawProfile;

    if (selectedTarget === "cars") {
      extractedData = {
        cars: { seed: 1000, items: carsMap },
        car_models: {
          keys: Object.keys(carsMap),
          values: Object.values(carsMap).map((v: any) => v.__desc_id || "")
        },
        real_estates: rawProfile.real_estates || {},
        real_estate_slots: rawProfile.real_estate_slots || {},
        car_to_real_estate_slot: rawProfile.car_to_real_estate_slot || { keys: [], values: [] },
        locations: rawProfile.locations || {}
      };
    } else if (selectedTarget !== "full" && selectedTarget !== "blueprint") {
      const meta = ACCOUNT_EXTRACT_PARTS[selectedTarget];
      if (meta && meta.path) {
        const nestedVal = getNestedProperty(rawProfile, meta.path);
        if (nestedVal !== null && nestedVal !== undefined) {
          extractedData = nestedVal;
        }
      }
    }

    let outputString = JSON.stringify(extractedData, null, 2);
    let compressedOutput = compressData(extractedData);
    if (format === "compressed" || format === "base64") {
      outputString = compressedOutput;
    }

    return res.json({
      success: true,
      message: `Extracted ${selectedTarget} successfully! (${totalCarsCount} cars found in garage)`,
      format: format || "json",
      target: selectedTarget,
      totalCars: totalCarsCount,
      stats,
      extractedString: outputString,
      compressedString: compressedOutput,
      jsonString: JSON.stringify(extractedData, null, 2),
      rawProfile: extractedData
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message || "Extraction failed." });
  }
});

// Admin / Owner endpoints

// Get all keys
app.get(["/api/admin/keys", "/admin/keys"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden. Admin access required." });
  }

  const db = await loadKeysDb();
  if (role === "admin") {
    const filteredKeys: Record<string, any> = {};
    for (const [key, data] of Object.entries(db.keys)) {
      if ((data as any).type === "user") {
        filteredKeys[key] = data;
      }
    }
    return res.json({
      success: true,
      keys: filteredKeys,
      total_credits_used: db.total_credits_used || 0,
      total_accounts_generated: db.total_accounts_generated || 0
    });
  }
  res.json({
    success: true,
    keys: db.keys,
    total_credits_used: db.total_credits_used || 0,
    total_accounts_generated: db.total_accounts_generated || 0
  });
});

// Generate key
app.post(["/api/admin/generate-key", "/admin/generate-key"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden. Admin access required." });
  }

  const { type, duration_val, duration_unit, max_claims, enabled_features, custom_key } = req.body;
  const creditAmount = resolveCreditsFromBody(req.body);
  const db = await loadKeysDb();

  const keyType = type || "user";
  if (keyType === "user" && creditAmount === -1) {
    return res.status(400).json({ success: false, message: "User keys cannot have unlimited credits. Please specify a valid credit amount." });
  }

  if (role !== "owner" && keyType === "admin") {
    return res.status(403).json({ success: false, message: "Only owners can create admin keys." });
  }

  if (role === "admin" && (duration_unit === "unlim" || !duration_unit)) {
    return res.status(403).json({ success: false, message: "Admins are not allowed to generate lifetime keys." });
  }

  let durationSeconds: number | null = null;
  const val = duration_val ? parseInt(duration_val, 10) : 0;
  if (duration_unit === "m") durationSeconds = val * 60;
  else if (duration_unit === "d") durationSeconds = val * 86400;
  else if (duration_unit === "mo") durationSeconds = val * 30 * 86400;

  let key = generateLicenseKey();
  if (custom_key && custom_key.trim()) {
    const trimmedKey = custom_key.trim();
    if (db.keys[trimmedKey]) {
      return res.status(400).json({ success: false, message: "License key name already exists. Please choose another name." });
    }
    key = trimmedKey;
  }

  const now = Date.now() / 1000;
  const expiresAt = durationSeconds ? now + durationSeconds : null;

  db.keys[key] = {
    type: keyType,
    created_at: now,
    expires_at: expiresAt,
    claimed_users: [],
    claimed_by: null,
    max_claims: max_claims ? parseInt(max_claims, 10) : 1,
    duration_unit: duration_unit || "unlim",
    duration_val: val || null,
    credits: creditAmount !== undefined ? creditAmount : 10,
    enabled_features: Array.isArray(enabled_features) ? enabled_features : DEFAULT_FEATURES
  };

  await saveKeysDb(db);
  res.json({ success: true, key, data: db.keys[key], created_at: now });
});

// Delete Key
app.post(["/api/admin/delete-key", "/admin/delete-key"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden. Admin access required." });
  }

  const { key } = req.body;
  if (!key) {
    return res.status(400).json({ success: false, message: "Key parameter is required." });
  }

  const db = await loadKeysDb();
  const keyData = db.keys[key];
  if (!keyData) {
    return res.status(404).json({ success: false, message: "Key not found." });
  }

  if (role === "admin" && keyData.type !== "user") {
    return res.status(403).json({ success: false, message: "Admins are only allowed to delete user keys." });
  }

  // Revoke active sessions claimed by this key
  const claimedUsers = keyData.claimed_users || [];
  claimedUsers.forEach((u: string) => {
    delete db.authorized_users[u];
  });

  delete db.keys[key];
  await saveKeysDb(db);

  res.json({ success: true, message: "Key successfully deleted." });
});

// Update Key Custom settings (Credits, Features, Max Claims, Expiry)
app.post(["/api/admin/update-key", "/admin/update-key"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden. Admin access required." });
  }

  const { key, enabled_features, max_claims, expires_at } = req.body;
  const creditAmount = resolveCreditsFromBody(req.body);
  if (!key) {
    return res.status(400).json({ success: false, message: "Key parameter is required." });
  }

  const db = await loadKeysDb();
  const keyData = db.keys[key];
  if (!keyData) {
    return res.status(404).json({ success: false, message: "Key not found." });
  }

  if (role === "admin" && keyData.type !== "user") {
    return res.status(403).json({ success: false, message: "Admins are only allowed to update user keys." });
  }

  if (creditAmount === -1 && keyData.type === "user") {
    return res.status(400).json({ success: false, message: "User keys cannot have unlimited credits. Please specify a valid credit amount." });
  }

  // Update properties if provided
  if (creditAmount !== undefined) {
    keyData.credits = creditAmount;
    delete keyData.tokens;
    if (creditAmount === -1 || creditAmount > 0) {
      keyData.out_of_credits = false;
      delete keyData.out_of_tokens;
    }
  }
  if (enabled_features !== undefined && Array.isArray(enabled_features)) {
    keyData.enabled_features = enabled_features;
  }
  if (max_claims !== undefined) {
    keyData.max_claims = parseInt(max_claims, 10);
  }
  if (expires_at !== undefined) {
    keyData.expires_at = expires_at === null ? null : parseInt(expires_at, 10);
  }

  db.keys[key] = keyData;
  await saveKeysDb(db);

  res.json({ success: true, message: "Key successfully updated.", data: keyData });
});

// Bulk Delete Keys
app.post(["/api/admin/bulk-delete-keys", "/admin/bulk-delete-keys"], authMiddleware, async (req, res) => {
  const role = (req as any).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ success: false, message: "Forbidden. Admin access required." });
  }

  const { keys } = req.body;
  if (!keys || !Array.isArray(keys)) {
    return res.status(400).json({ success: false, message: "Keys array is required." });
  }

  const db = await loadKeysDb();
  let deletedCount = 0;

  for (const k of keys) {
    const keyData = db.keys[k];
    if (keyData) {
      if (role === "admin" && keyData.type !== "user") {
        // Skip deleting admin/owner keys if sender is just an admin
        continue;
      }
      // Revoke active sessions claimed by this key
      const claimedUsers = keyData.claimed_users || [];
      claimedUsers.forEach((u: string) => {
        delete db.authorized_users[u];
      });
      delete db.keys[k];
      deletedCount++;
    }
  }

  await saveKeysDb(db);
  res.json({ success: true, message: `Successfully deleted ${deletedCount} keys.` });
});

// CarX Account Login
app.post(["/api/carx/login", "/carx/login"], authMiddleware, async (req, res) => {
  const { email, password, deviceId, uniqueId } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  const result = await CarXClient.authenticate("login", email, password, deviceId, uniqueId);
  await CarXClient.fetchAndAttachProfileStats(result);
  res.json(result);
});

// CarX Account Register
app.post(["/api/carx/register", "/carx/register"], authMiddleware, async (req, res) => {
  const { email, password, deviceId, uniqueId, verify } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  let result: Awaited<ReturnType<typeof CarXClient.authenticate>>;
  let mailToken: string | null = null;

  if (verify) {
    // ⚡ PARALLEL: mailbox creation + CarX registration fire at the same time
    console.log(`[REGISTER] Synchronous mailbox+register for ${email}...`);
    const [mbToken, reg] = await Promise.all([
      precreateMailbox(email, password),
      CarXClient.authenticate("register", email, password, deviceId, uniqueId)
    ]);
    mailToken = mbToken;
    result = reg;

    if (result.success) {
      console.log(`[REGISTER] ⚡ Auto-verifying ${email} (mailToken=${mailToken ? "ready" : "null"})...`);
      const verifyRes = await autoVerifyMailtm(email, password, result.token, result.deviceId, result.uniqueId, mailToken);
      console.log(`[REGISTER AUTO-VERIFY] ${email}: success=${verifyRes.success} code=${verifyRes.code ?? "N/A"} | ${verifyRes.message}`);

      if (!verifyRes.success) {
        return res.json({
          success: false,
          message: `Account registered successfully on CarX, but auto-verification failed: ${verifyRes.message}. You can verify it manually under the Verify tab.`
        });
      }
    }
  } else {
    result = await CarXClient.authenticate("register", email, password, deviceId, uniqueId);
  }

  if (result.success) {
    try {
      const db = await loadKeysDb();
      db.total_accounts_generated = (db.total_accounts_generated || 0) + 1;
      await saveKeysDb(db);
    } catch (e) {
      console.error("[TELEMETRY] Failed to increment registered count:", e);
    }

    await CarXClient.fetchAndAttachProfileStats(result);
  }
  res.json(result);
});


// CarX Account Verify
app.post(["/api/carx/verify", "/carx/verify"], authMiddleware, async (req, res) => {
  const { email, password, code, deviceId, uniqueId } = req.body;
  if (!email || !password || !code) {
    return res.status(400).json({ success: false, message: "Email, password, and verification code are required." });
  }

  const result = await CarXClient.verifyAccount(email, password, code, undefined, deviceId, uniqueId);
  await CarXClient.fetchAndAttachProfileStats(result);
  res.json(result);
});

// CarX Fetch Real Profile Stats
app.post(["/api/carx/profile", "/carx/profile"], authMiddleware, async (req, res) => {
  const { token, userId, deviceId, uniqueId } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: "Token is required." });
  }

  try {
    const [profileResult, authState] = await Promise.all([
      CarXClient.getProfile(token, userId, deviceId, uniqueId),
      CarXClient.getAuthState(token)
    ]);
    const { profile, response } = profileResult;

    if (!authState) {
      return res.json({
        success: false,
        message: "Session expired (logged into another device/game). Please reconnect your account."
      });
    }

    let stats: any;
    if (profile) {
      stats = extractProfileStats(profile, false);
    } else {
      // Return starting stats for fresh/uninitialized accounts (rather than throwing 502)
      stats = {
        cash: 21000,
        gold: 0,
        level: 1,
        exp: 0,
        name: null,
        avatar: null,
        lastUpdated: null,
        isVerified: authState ? !!authState.verified : false,
        isFallback: true
      };
    }

    if (authState) {
      stats.isVerified = !!authState.verified;
    }

    return res.json({
      success: true,
      stats,
      rawProfile: profile || null
    });
  } catch (e: any) {
    console.error("[PROFILE ERROR]", e.message || e);
    return res.json({ success: false, message: e.message || "Error fetching profile." });
  }
});


// CarX Account Delete
app.post(["/api/carx/delete", "/carx/delete"], authMiddleware, async (req, res) => {
  const { token, email, password } = req.body;
  if (!token || !email || !password) {
    return res.status(400).json({ success: false, message: "Token, email, and password are required." });
  }

  const result = await CarXClient.deleteAccount(token, email, password);
  res.json(result);
});

// CarX Account Unblock
app.post(["/api/carx/unblock", "/carx/unblock"], authMiddleware, async (req, res) => {
  const { email, password, token, userId, deviceId, uniqueId, verify } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  let activeToken = token;
  let activeUserId = userId;
  let activeDeviceId = deviceId || crypto.randomBytes(8).toString("hex");
  let activeUniqueId = uniqueId || crypto.randomUUID().replace(/-/g, "");

  console.log(`[UNBLOCK] Logging in to get token for ${email}...`);
  const loginRes = await CarXClient.authenticate("login", email, password, activeDeviceId, activeUniqueId);
  if (loginRes.success && loginRes.token) {
    activeToken = loginRes.token;
    activeUserId = loginRes.userId ? String(loginRes.userId) : activeUserId;
    activeDeviceId = loginRes.deviceId || activeDeviceId;
    activeUniqueId = loginRes.uniqueId || activeUniqueId;
    console.log(`[UNBLOCK] Login succeeded. Token: ${activeToken}, UserId: ${activeUserId}`);
  } else {
    console.log(`[UNBLOCK] Login failed: ${loginRes.message || "Unknown error"}. Verifying if account exists...`);

    // Check if the username exists by attempting a check registration
    const checkReg = await CarXClient.authenticate("register", email, password, activeDeviceId, activeUniqueId);
    if (checkReg.success && checkReg.token) {
      // Registration succeeded, meaning the account did NOT exist. Clean it up and reject unblock.
      console.log(`[UNBLOCK] Check registration succeeded (account did not exist). Deleting test account...`);
      await CarXClient.deleteAccount(checkReg.token, email, password);
      return res.status(400).json({
        success: false,
        message: "Account is not yet registered. Cannot unblock."
      });
    } else {
      // Registration failed because account already exists (so it is registered, but password was incorrect or other issue)
      console.log(`[UNBLOCK] Check registration failed (account exists): ${checkReg.message}`);

      // If we already have a provided token, we can proceed with that token (fallback)
      if (activeToken) {
        console.log(`[UNBLOCK] Proceeding with provided token fallback.`);
      } else {
        return res.status(400).json({
          success: false,
          message: `Failed to login to blocked account. If the account exists, the password might be incorrect. Detail: ${loginRes.message}`
        });
      }
    }
  }

  // 1. Fetch profile
  console.log(`[UNBLOCK] Fetching profile for ${email}...`);
  const profileResult = await CarXClient.getProfile(activeToken, activeUserId, activeDeviceId, activeUniqueId);
  let { profile, isWrappedInD, isWrappedInData } = profileResult;
  let usingFallback = false;

  if (!profile) {
    console.log(`[UNBLOCK] Profile fetch failed (account may be banned). Falling back to template profile.`);
    profile = PROFILE_TEMPLATE ? structuredClone(PROFILE_TEMPLATE) : null;
    usingFallback = true;
    isWrappedInD = true;
    isWrappedInData = false;
  }

  if (!profile) {
    return res.status(400).json({
      success: false,
      message: "Failed to fetch profile from the blocked account and template profile is unavailable."
    });
  }

  // 2. Delete account
  console.log(`[UNBLOCK] Deleting account ${email}...`);
  const deleteResult = await CarXClient.deleteAccount(activeToken, email, password);
  if (!deleteResult.success) {
    return res.status(400).json({
      success: false,
      message: "Failed to delete the blocked account: " + deleteResult.message
    });
  }

  // 3. Register account back
  console.log(`[UNBLOCK] Registering account ${email} back...`);
  let regResult: any;
  let mailToken: string | null = null;
  if (verify) {
    console.log(`[UNBLOCK] Auto-verifying new account for ${email}...`);
    const [mbToken, reg] = await Promise.all([
      precreateMailbox(email, password),
      CarXClient.authenticate("register", email, password, activeDeviceId, activeUniqueId)
    ]);
    mailToken = mbToken;
    regResult = reg;

    if (regResult.success) {
      const verifyRes = await autoVerifyMailtm(email, password, regResult.token, regResult.deviceId, regResult.uniqueId, mailToken);
      if (!verifyRes.success) {
        console.warn(`[UNBLOCK VERIFY FAILED] ${verifyRes.message}`);
      }
    }
  } else {
    regResult = await CarXClient.authenticate("register", email, password, activeDeviceId, activeUniqueId);
  }

  if (!regResult.success) {
    return res.status(400).json({
      success: false,
      message: "Deleted the blocked account successfully, but failed to re-register: " + regResult.message
    });
  }

  // 4. Upload profile
  console.log(`[UNBLOCK] Uploading profile back to new account...`);
  if (usingFallback) {
    const targetCash = req.body.cash !== undefined ? Number(req.body.cash) : (req.body.profileStats?.cash !== undefined ? Number(req.body.profileStats.cash) : 100000000);
    const targetGold = req.body.gold !== undefined ? Number(req.body.gold) : (req.body.profileStats?.gold !== undefined ? Number(req.body.profileStats.gold) : 50000);
    const targetLevel = req.body.level !== undefined ? Number(req.body.level) : (req.body.profileStats?.level !== undefined ? Number(req.body.profileStats.level) : 50);
    const targetExp = req.body.exp !== undefined ? Number(req.body.exp) : (req.body.profileStats?.exp !== undefined ? Number(req.body.profileStats.exp) : targetLevel * 10000);

    console.log(`[UNBLOCK] Customizing fallback profile: cash=${targetCash}, gold=${targetGold}, level=${targetLevel}`);
    profile = modifyProfile(profile, { cash: targetCash, gold: targetGold, level: targetLevel, exp: targetExp }, regResult.userId);
  }

  profile.date_time = new Date().toISOString().replace("T", " ").substring(0, 19);

  const upload = await CarXClient.uploadProfile(
    regResult.token,
    profile,
    regResult.userId,
    undefined,
    isWrappedInD,
    isWrappedInData,
    regResult.deviceId,
    regResult.uniqueId
  );

  if (upload.success) {
    await CarXClient.fetchAndAttachProfileStats(regResult);
    return res.json({
      success: true,
      message: "Account successfully unblocked! Profile was backed up, account deleted, re-registered, and profile restored.",
      account: {
        email,
        password,
        token: regResult.token,
        user_id: regResult.userId ? String(regResult.userId) : undefined,
        deviceId: regResult.deviceId,
        uniqueId: regResult.uniqueId,
        unipId: regResult.unipId || regResult.uniqueId,
        profileStats: regResult.profileStats || undefined,
        statsFetchedAt: regResult.profileStats ? Date.now() : undefined,
      }
    });
  } else {
    return res.status(400).json({
      success: false,
      message: "Account was deleted and re-registered successfully, but failed to upload your backed up profile back to it."
    });
  }
});

// CarX Injection Endpoints
app.post(["/api/carx/inject", "/carx/inject"], authMiddleware, async (req, res) => {
  const {
    token,
    userId,
    service_type,
    custom_amount,
    deviceId,
    uniqueId,
    unlock_houses = false,
    unlock_clubs = false,
    get_all_cars = false,
    unlock_streetpass = false,
    inject_ep = false,
    unlock_profile_style = false,
    inject_car,
    inject_cars,
    avatar,
    banner,
    frame,
    random_cars_count
  } = req.body;

  if (!token || !service_type) {
    return res.status(400).json({ success: false, message: "Token and service_type are required." });
  }

  // Block Premium and EP point features while under active development
  if (service_type === "premium" || service_type === "custom_ep" || service_type === "streetpass_ep") {
    return res.status(403).json({
      success: false,
      message: "⚠️ Feature Under Development: Premium Account and EP Point features are currently locked while under development."
    });
  }

  const role = (req as any).role;
  const licenseKey = (req as any).licenseKey;

  // Map service_type to feature ID
  const featureMap: Record<string, string> = {
    cash: "cash_gold",
    gold: "cash_gold",
    custom_resource: "cash_gold",
    exp: "level_xp",
    level: "level_xp",
    unlock_clubs: "unlock_clubs",
    get_all_cars: "get_all_cars",
    inject_regular_cars: "get_all_cars",
    inject_premium_cars: "get_all_cars",
    regular_cars: "get_all_cars",
    premium_cars: "get_all_cars",
    safe_repair: "safe_repair",
    battlepass: "battlepass",
    custom_ep: "streetpass_ep",
    inject_all: "cash_gold",
    inject_everything: "cash_gold",
    unlock_profile_style: "battlepass",
    inject_car: "get_all_cars",
    inject_cars: "get_all_cars",
    inject_random_cars: "get_all_cars",
    premium: "premium"
  };

  // Credit cost map for each injection service_type
  const creditCostMap: Record<string, number> = {
    cash: 2,
    gold: 2,
    custom_resource: 0,
    exp: 1,
    level: 1,
    unlock_clubs: 3,
    get_all_cars: 4,
    inject_regular_cars: 4,
    inject_premium_cars: 4,
    regular_cars: 4,
    premium_cars: 4,
    safe_repair: 1,
    battlepass: 5,
    custom_ep: 2,
    inject_all: 3,
    inject_everything: 15,
    premium: 5,
    unlock_profile_style: 3,
    inject_car: 1,
    inject_cars: 1,
    inject_random_cars: 2
  };

  let creditCost = creditCostMap[service_type] || 1;
  if (service_type === "inject_cars") {
    const carsCount = Array.isArray(inject_cars) ? inject_cars.length : 0;
    if (carsCount === 0) {
      return res.status(400).json({ success: false, message: "No cars selected for injection." });
    }
    creditCost = carsCount * 1;
  }

  let customResourceParsed: {
    cash: { ok: boolean; value: number | null; message: string };
    gold: { ok: boolean; value: number | null; message: string };
    exp: { ok: boolean; value: number | null; message: string };
  } | null = null;

  const isComboAction = service_type === "inject_all" || service_type === "inject_everything";

  if (service_type === "custom_resource") {
    const cashParsed = parseResourceValue(req.body.cash, 0, MAX_CASH, "cash");
    if (!cashParsed.ok) return res.status(400).json({ success: false, message: cashParsed.message });
    const goldParsed = parseResourceValue(req.body.gold, 0, MAX_GOLD, "gold");
    if (!goldParsed.ok) return res.status(400).json({ success: false, message: goldParsed.message });
    const expParsed = parseResourceValue(req.body.exp, 1, MAX_EXP, "exp");
    if (!expParsed.ok) return res.status(400).json({ success: false, message: expParsed.message });

    customResourceParsed = { cash: cashParsed, gold: goldParsed, exp: expParsed };
    creditCost = 0;
    if (cashParsed.value !== null) creditCost += 1;
    if (goldParsed.value !== null) creditCost += 1;
    if (expParsed.value !== null) creditCost += 1;
    if (unlock_streetpass) creditCost += 5;
    if (unlock_houses || unlock_clubs) creditCost += 3;
    if (get_all_cars) creditCost += 4;

    if (creditCost === 0) {
      return res.status(400).json({ success: false, message: "No resources or add-ons selected for custom injection." });
    }
  } else if (!isComboAction && service_type !== "safe_repair") {
    if (unlock_streetpass && service_type !== "battlepass" && service_type !== "custom_ep") {
      creditCost += 5;
    }
    if ((unlock_houses || unlock_clubs) && service_type !== "unlock_clubs") {
      creditCost += 3;
    }
    if (get_all_cars && service_type !== "get_all_cars") {
      creditCost += 4;
    }
  }

  let requestedFeature = featureMap[service_type];
  if (!requestedFeature) {
    return res.status(400).json({ success: false, message: "Invalid service_type." });
  }

  // Special check for custom_resource to validate individual permissions
  if (service_type === "custom_resource") {
    requestedFeature = "bypass_check";
    const db = await loadKeysDb();
    const keyData = db.keys[licenseKey];
    if (role !== "owner" && licenseKey !== OWNER_KEY && keyData) {
      const enabled = keyData.enabled_features || DEFAULT_FEATURES;
      if (customResourceParsed) {
        if (customResourceParsed.cash.value !== null || customResourceParsed.gold.value !== null) {
          if (!enabled.includes("cash_gold")) {
            return res.status(403).json({ success: false, message: "Access Denied: The \"cash_gold\" feature is not unlocked for your license key." });
          }
        }
        if (customResourceParsed.exp.value !== null) {
          if (!enabled.includes("level_xp")) {
            return res.status(403).json({ success: false, message: "Access Denied: The \"level_xp\" feature is not unlocked for your license key." });
          }
        }
      }
    }
  }

  // Special check for inject_all / inject_everything: requires all 4 underlying features to be unlocked!
  if (service_type === "inject_all" || service_type === "inject_everything") {
    const checkAllFeatures = ["cash_gold", "level_xp", "unlock_clubs", "get_all_cars"];
    const db = await loadKeysDb();
    const keyData = db.keys[licenseKey];
    if (role !== "owner" && licenseKey !== OWNER_KEY && keyData) {
      const enabled = keyData.enabled_features || DEFAULT_FEATURES;
      for (const f of checkAllFeatures) {
        if (!enabled.includes(f)) {
          return res.status(403).json({ success: false, message: `Access Denied: The inject everything package requires "${f}" feature permission.` });
        }
      }
    }
  }

  const check = await checkAndDeductCredit(licenseKey, role, requestedFeature, creditCost);
  if (!check.success) {
    return res.status(check.message?.includes("Access Denied") ? 403 : 402).json({ success: false, message: check.message });
  }

  // Fire-and-forget credit deduction — respond immediately after success, DB writes in background
  const deductCreditOnSuccess = () => {
    loadKeysDb(true).then(db => {
      if (role !== "owner" && licenseKey !== OWNER_KEY) {
        const keyData = db.keys[licenseKey];
        if (keyData) {
          const currentCredits = getKeyCredits(keyData);
          if (currentCredits !== -1) {
            keyData.credits = Math.max(0, currentCredits - creditCost);
            delete keyData.tokens;
            if (keyData.credits === 0) {
              keyData.out_of_credits = true;
              delete keyData.out_of_tokens;
            }
          }
        }
      }
      db.total_credits_used = (db.total_credits_used || 0) + creditCost;
      saveKeysDb(db).catch(e => console.error("[CREDITS] Failed to deduct credits:", e));
      console.log(`[CREDITS] Logged deduction of ${creditCost} credits.`);
    }).catch(e => console.error("[CREDITS] Failed to load db for deduction:", e));
  };

  // Optimized: get remaining credits from in-memory cache
  const getRemainingCredits = async () => getRemainingCreditsGlobal(licenseKey, role);

  try {
    // ── Handle profile-based injections (get profile + modify + upload) ──────────
    const profileTypes = [
      "cash", "gold", "exp", "level", "unlock_clubs", "get_all_cars",
      "inject_regular_cars", "inject_premium_cars", "regular_cars", "premium_cars",
      "custom_resource", "safe_repair", "unlock_profile_style", "inject_car",
      "inject_cars", "inject_random_cars", "battlepass", "custom_ep"
    ];

    if (profileTypes.includes(service_type)) {
      // First trigger and wait for StreetPass and EP verification to complete if requested.
      // This ensures that any updated event/streetpass state exists in the game server's database
      // before we fetch the profile, preventing the subsequent profile upload from overwriting/wiping it.
      let spResult = false;
      if (unlock_streetpass || service_type === "battlepass" || service_type === "custom_ep") {
        spResult = await CarXClient.verifyStreetPass(token, JSON.parse(STREETPASS_BODY), deviceId, uniqueId);
      }

      if (inject_ep) {
        const epObj = JSON.parse(STREETPASS_BODY.replace(/com\.carxtech\.sr\.bank\.event\.bp/g, "com.carxtech.sr.bank.event.ep_big"));
        await Promise.all(
          Array.from({ length: 5 }, () => CarXClient.verifyStreetPass(token, epObj, deviceId, uniqueId))
        );
      }

      // Fetch profile AFTER the verify requests have fully updated the database state
      const profileResult = await CarXClient.getProfile(token, userId, deviceId, uniqueId);
      const optStreetPassSuccess = spResult;
      const { profile, response, isWrappedInD, isWrappedInData } = profileResult;

      if (!profile && service_type !== "safe_repair") {
        return res.status(400).json({ success: false, message: "Failed to download profile. Check account status." });
      }

      const db = await loadKeysDb();

      let modified: any;
      let successMsg = "";

      if (service_type === "cash") {
        const amount = custom_amount ? parseInt(custom_amount, 10) : 99000000;
        modified = modifyProfile(profile, { cash: amount, unlock_houses, unlock_clubs, get_all_cars, _db: db }, userId);
        successMsg = `Successfully injected ${amount.toLocaleString()} Cash!`;
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
        if (unlock_clubs) successMsg += " (All Clubs Unlocked)";
        if (get_all_cars) successMsg += " (All Cars Injected)";
        if (unlock_streetpass) successMsg += " (StreetPass Activated)";
        if (inject_ep) successMsg += " (EP Point loops sent)";
      } else if (service_type === "gold") {
        const amount = custom_amount ? parseInt(custom_amount, 10) : 99000000;
        modified = modifyProfile(profile, { gold: amount, unlock_houses, unlock_clubs, get_all_cars, _db: db }, userId);
        successMsg = `Successfully injected ${amount.toLocaleString()} Gold!`;
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
        if (unlock_clubs) successMsg += " (All Clubs Unlocked)";
        if (get_all_cars) successMsg += " (All Cars Injected)";
        if (unlock_streetpass) successMsg += " (StreetPass Activated)";
        if (inject_ep) successMsg += " (EP Point loops sent)";
      } else if (service_type === "exp" || service_type === "level") {
        const amount = custom_amount ? parseInt(custom_amount, 10) : 93060;
        modified = modifyProfile(profile, { level: 50, exp: amount, unlock_houses, unlock_clubs, get_all_cars, _db: db }, userId);
        successMsg = `Successfully boosted EXP to ${amount.toLocaleString()} (Level 50)!`;
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
        if (unlock_clubs) successMsg += " (All Clubs Unlocked)";
        if (get_all_cars) successMsg += " (All Cars Injected)";
        if (unlock_streetpass) successMsg += " (StreetPass Activated)";
        if (inject_ep) successMsg += " (EP Point loops sent)";
      } else if (service_type === "unlock_clubs") {
        modified = modifyProfile(profile, { unlock_clubs: true, unlock_houses, get_all_cars, _db: db }, userId);
        successMsg = "Successfully unlocked and completed all 7 Clubs!";
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
        if (get_all_cars) successMsg += " (All Cars Injected)";
        if (unlock_streetpass) successMsg += " (StreetPass Activated)";
        if (inject_ep) successMsg += " (EP Point loops sent)";
      } else if (service_type === "inject_regular_cars" || service_type === "regular_cars") {
        modified = modifyProfile(profile, { regular_cars: true, unlock_houses, unlock_clubs, _db: db }, userId);
        successMsg = "🚗 Successfully injected Regular Cars package into your garage! Turn on/off your game to sync.";
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
        if (unlock_clubs) successMsg += " (All Clubs Unlocked)";
        if (unlock_streetpass) successMsg += " (StreetPass Activated)";
        if (inject_ep) successMsg += " (EP Point loops sent)";
      } else if (service_type === "inject_premium_cars" || service_type === "premium_cars" || service_type === "get_all_cars") {
        modified = modifyProfile(profile, { premium_cars: true, unlock_houses, unlock_clubs, _db: db }, userId);
        successMsg = "👑 Successfully injected Premium Cars package into your garage! Turn on/off your game to sync.";
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
        if (unlock_clubs) successMsg += " (All Clubs Unlocked)";
        if (unlock_streetpass) successMsg += " (StreetPass Activated)";
        if (inject_ep) successMsg += " (EP Point loops sent)";
      } else if (service_type === "custom_resource") {
        if (!customResourceParsed) {
          return res.status(400).json({ success: false, message: "Invalid custom resource payload." });
        }
        const { cash: cashParsed, gold: goldParsed, exp: expParsed } = customResourceParsed;
        modified = modifyProfile(profile, {
          cash: cashParsed.value ?? undefined,
          gold: goldParsed.value ?? undefined,
          level: expParsed.value !== null ? calculateLevelFromExp(expParsed.value) : undefined,
          exp: expParsed.value ?? undefined,
          unlock_houses,
          unlock_clubs,
          get_all_cars,
          _db: db
        }, userId);
        successMsg = "✅ Custom resources injected successfully!";
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
        if (unlock_streetpass) successMsg += " (StreetPass Activated)";
        if (inject_ep) successMsg += " (EP Point loops sent)";
      } else if (service_type === "safe_repair") {
        modified = modifyProfile(profile || {}, {
          safe_repair: true,
          cash: 99000000,
          gold: 99000000,
          level: 50,
          exp: 93060,
          unlock_houses,
          unlock_clubs: true, // Force true to match the warning message stating it will beat all clubs
          get_all_cars,
          _db: db
        }, userId);
        successMsg = "✅ Safe Profile Repair completed successfully! The corrupted real estate slots were wiped and replaced with 100% valid game database references. Injected 99M Cash & 99M Gold safely. You can now load into the game!";
        if (unlock_houses) successMsg += " (All Houses Unlocked)";
      } else if (service_type === "unlock_profile_style") {
        modified = modifyProfile(profile, {
          unlock_profile_style: true,
          avatar,
          banner,
          frame,
          _db: db
        }, userId);
        successMsg = "✅ Profile Customization Styles Unlocked and Applied successfully!";
      } else if (service_type === "inject_car") {
        if (!inject_car) {
          return res.status(400).json({ success: false, message: "Car model name (inject_car) is required." });
        }
        modified = modifyProfile(profile, {
          inject_car,
          _db: db
        }, userId);
        successMsg = `✅ Car "${inject_car}" successfully injected into your garage!`;
      } else if (service_type === "inject_cars") {
        if (!inject_cars || !Array.isArray(inject_cars) || inject_cars.length === 0) {
          return res.status(400).json({ success: false, message: "A list of selected cars (inject_cars) is required." });
        }
        modified = modifyProfile(profile, {
          inject_cars,
          _db: db
        }, userId);
        successMsg = `✅ Successfully injected ${inject_cars.length} selected cars into your garage!`;
      } else if (service_type === "inject_random_cars") {
        const count = parseInt(random_cars_count, 10);
        if (isNaN(count) || count <= 0) {
          return res.status(400).json({ success: false, message: "A valid positive random_cars_count is required." });
        }
        modified = modifyProfile(profile, {
          random_cars_count: count,
          _db: db
        }, userId);
        successMsg = `✅ Injected ${count} random cars into your garage successfully!`;
      } else if (service_type === "battlepass" || service_type === "custom_ep") {
        modified = modifyProfile(profile, {
          unlock_profile_style: true,
          _db: db
        }, userId);
        successMsg = service_type === "battlepass"
          ? "✅ Premium StreetPass successfully verified & activated! Unlocked all avatars, frames, banners, and quick chats."
          : "✅ Event Points (EP) successfully simulated! Unlocked all 16 avatars, 16 frames, 16 banners, and 4 quick chats.";
      }

      const upload = await CarXClient.uploadProfile(token, modified, userId, response, isWrappedInD, isWrappedInData, deviceId, uniqueId);
      if (upload.success) {
        deductCreditOnSuccess(); // fire-and-forget
        const remCredits = await getRemainingCredits();
        const [authState] = await Promise.all([
          CarXClient.getAuthState(token).catch(() => null)
        ]);
        const stats = extractProfileStats(modified, false);
        if (authState) stats.isVerified = !!authState.verified;
        return res.json({ success: true, message: successMsg, stats, ...creditResponse(remCredits) });
      }
      return res.status(400).json({ success: false, message: "Failed to upload injected profile to server." });
    }

    // ── inject_all / inject_everything ──────────────────────────────────────────
    if (service_type === "inject_all" || service_type === "inject_everything") {
      const isEverything = service_type === "inject_everything";
      const shouldUnlockSP = unlock_streetpass || isEverything;
      const shouldInjectEP = inject_ep || isEverything;

      // Run SP verify and EP loops first, and wait for completion.
      // This ensures the database is fully updated before we fetch the profile to avoid resetting values.
      let bpSuccess = false;
      if (shouldUnlockSP) {
        bpSuccess = await CarXClient.verifyStreetPass(token, JSON.parse(STREETPASS_BODY), deviceId, uniqueId);
      }

      if (shouldInjectEP) {
        const epObj = JSON.parse(STREETPASS_BODY.replace(/com\.carxtech\.sr\.bank\.event\.bp/g, "com.carxtech.sr.bank.event.ep_big"));
        await Promise.all(
          Array.from({ length: 5 }, () => CarXClient.verifyStreetPass(token, epObj, deviceId, uniqueId))
        );
      }

      // Fetch profile AFTER the verify requests have fully updated the database state
      const profileResult = await CarXClient.getProfile(token, userId, deviceId, uniqueId);
      const { profile, response, isWrappedInD, isWrappedInData } = profileResult;

      if (!profile) {
        return res.status(400).json({ success: false, message: "Failed to download profile." });
      }

      const db = await loadKeysDb();

      const modified = modifyProfile(profile, {
        cash: 99000000,
        gold: 99000000,
        level: 50,
        exp: 93060,
        unlock_clubs: unlock_clubs || isEverything,
        get_all_cars: get_all_cars || isEverything,
        unlock_houses: unlock_houses || isEverything,
        unlock_profile_style: isEverything,
        _db: db
      }, userId);

      const upload = await CarXClient.uploadProfile(token, modified, userId, response, isWrappedInD, isWrappedInData, deviceId, uniqueId);
      if (upload.success) {
        deductCreditOnSuccess(); // fire-and-forget
        const remCredits = await getRemainingCredits();
        let msg = isEverything
          ? "✅ Everything successfully injected!\n💵 Cash: 99M\n🪙 Gold: 99M\n📈 EXP: 93,060 (Level 50)\n🏆 All Clubs Unlocked\n🚗 All 69 Cars Injected"
          : "✅ Default Boost successfully injected!\n💵 Cash: 99M\n🪙 Gold: 99M\n📈 EXP: 93,060 (Level 50)\n🏆 All Clubs Unlocked\n🚗 Starting Car R34 Active";

        const spActivated = isEverything ? bpSuccess : (unlock_streetpass ? bpSuccess : false);
        if (spActivated) {
          msg += "\n🎟 Premium StreetPass: Activated ✅";
        } else if (unlock_streetpass || isEverything) {
          msg += "\n🎟 Premium StreetPass: Activation Failed/Timeout ⚠️";
        }
        const [authState] = await Promise.all([
          CarXClient.getAuthState(token).catch(() => null)
        ]);
        const stats = extractProfileStats(modified, false);
        if (authState) stats.isVerified = !!authState.verified;
        return res.json({ success: true, message: msg, stats, ...creditResponse(remCredits) });
      }
      return res.status(400).json({ success: false, message: "Failed to upload comprehensive profile." });
    }

    // ── battlepass ───────────────────────────────────────────────────────────────


    // ── premium ──────────────────────────────────────────────────────────────────
    if (service_type === "premium") {
      const result = await CarXClient.unlockPremium(token, deviceId, uniqueId);
      if (result.success) {
        deductCreditOnSuccess(); // fire-and-forget
        const remCredits = await getRemainingCredits();
        return res.json({
          success: true,
          message: `✅ Premium Account subscription successfully verified & activated! Expired at: ${result.expired}`,
          ...creditResponse(remCredits)
        });
      }
      return res.status(400).json({ success: false, message: result.message || "Failed to unlock premium account." });
    }

    return res.status(400).json({ success: false, message: "Invalid service_type." });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message || "Internal server error during injection" });
  }
});

// Bulk accounts generation & logging

// Precompiled regex patterns for extracting verification codes from emails
const CODE_PATTERNS = [
  /registration code below[^\n]*\r?\n[^\n]*?([a-z0-9]{6})\b/i,
  /code below[^\n]*\r?\n[^\n]*?([a-z0-9]{6})\b/i,
  /verification code[^\n]*\r?\n[^\n]*?([a-z0-9]{6})\b/i,
  /your code[^\n]*:\s*([a-z0-9]{6})\b/i,
  /\bcode[^\n]{0,30}?:\s*([a-z0-9]{6})\b/i,
  // Spaced codes like  "a b c d e f"
  /\b([a-z0-9] [a-z0-9] [a-z0-9] [a-z0-9] [a-z0-9] [a-z0-9])\b/i,
  // Standalone 6-char alphanumeric block — last resort
  /\b([a-z0-9]{6})\b/i,
];

function extractCode(text: string): string | null {
  // Normalize all whitespace to simplify regex matching across lines
  const normalized = text.replace(/\s+/g, " ");

  // 1. Look for a 6-character code immediately following key instructions
  const nearCodeMatch = normalized.match(/(?:code below|registration code below|verification code)\s*:?\s*\b([a-z0-9]{6})\b/i);
  if (nearCodeMatch?.[1]) {
    const code = nearCodeMatch[1].toLowerCase();
    const exclude = ["please", "ignore", "delete", "thanks", "system", "client", "online", "report"];
    if (!exclude.includes(code)) {
      return code;
    }
  }

  // 2. Scan all 6-character alphanumeric blocks and look for one containing a digit (e.g. bh4965)
  // This avoids matching standard dictionary words like "please", "thanks", or "ignore"
  const matches = normalized.matchAll(/\b([a-z0-9]{6})\b/gi);
  for (const m of matches) {
    const code = m[1].toLowerCase();
    if (/\d/.test(code)) {
      const exclude = ["please", "ignore", "delete", "thanks", "system", "client", "online", "report"];
      if (!exclude.includes(code)) {
        return code;
      }
    }
  }

  // 3. Fallback to precompiled patterns (excluding common words)
  for (const pat of CODE_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1]) {
      const code = m[1].replace(/\s/g, "").toLowerCase();
      const exclude = ["please", "ignore", "delete", "thanks", "system", "client", "online", "report"];
      if (code.length === 6 && !exclude.includes(code)) {
        return code;
      }
    }
  }
  return null;
}

/** Fetch the first active domain from mail.tm */
async function getMailTmDomain(): Promise<string> {
  try {
    const resp = await fetch("https://api.mail.tm/domains?page=1", {
      headers: { "Accept": "application/json" }
    });
    if (resp.status === 200) {
      const data = await resp.json() as any;
      const members: any[] = data["hydra:member"] || [];
      const active = members.find((d: any) => d.isActive);
      if (active?.domain) {
        console.log(`[MAIL.TM] Using domain: ${active.domain}`);
        return active.domain;
      }
    }
  } catch (e: any) {
    console.warn("[MAIL.TM] Could not fetch domains, falling back to web-library.net:", e.message);
  }
  return "web-library.net"; // fallback
}

async function precreateMailbox(email: string, pass: string): Promise<string | null> {
  const mailApiUrl = "https://api.mail.tm";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const createResp = await fetch(`${mailApiUrl}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: email, password: pass })
      });
      if (createResp.status === 429) {
        // Backoff on rate limit
        await new Promise(r => setTimeout(r, 2000));
      }
      const tokenResp = await fetch(`${mailApiUrl}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: email, password: pass })
      });
      if (tokenResp.status === 429) {
        // Backoff on rate limit
        await new Promise(r => setTimeout(r, 2000));
      }
      if (tokenResp.status === 200) {
        const td = await tokenResp.json() as any;
        return td.token as string;
      }
      if (createResp.status === 201 || createResp.status === 422) {
        const tr = await fetch(`${mailApiUrl}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: email, password: pass })
        });
        if (tr.status === 429) {
          await new Promise(r => setTimeout(r, 2000));
        }
        if (tr.status === 200) {
          const td = await tr.json() as any;
          return td.token as string;
        }
      }
      console.warn(`[MAIL.TM PRECREATE] Attempt ${attempt} failed (create status: ${createResp.status}, token status: ${tokenResp.status}).`);
    } catch (err: any) {
      console.error(`[MAIL.TM PRECREATE] Attempt ${attempt} error for ${email}:`, err.message || err);
    }
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}


async function autoVerifyMailtm(
  email: string,
  pass: string,
  carxToken?: string,
  deviceId?: string,
  uniqueId?: string,
  preloadedMailToken?: string | null
): Promise<{ success: boolean; message: string; code?: string }> {
  const mailApiUrl = "https://api.mail.tm";
  const POLL_INITIAL_MS = 1500;  // wait 1.5s before first check — fastest safe start
  const POLL_INTERVAL_MS = 500;  // poll every 500ms for near-instant detection
  const MAX_ATTEMPTS = 120;      // 120 × 500ms = 60s total window to allow slow emails

  try {
    let mailToken = preloadedMailToken || null;

    if (!mailToken) {
      console.log(`[MAIL.TM] Setting up mailbox for ${email}...`);
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const [createResp, tokenResp] = await Promise.all([
            fetch(`${mailApiUrl}/accounts`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: email, password: pass })
            }),
            fetch(`${mailApiUrl}/token`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: email, password: pass })
            })
          ]);

          if (tokenResp.status === 200) {
            mailToken = ((await tokenResp.json()) as any).token;
          } else if (createResp.status === 201 || createResp.status === 422) {
            // Account created or already exists - get token
            const tr = await fetch(`${mailApiUrl}/token`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: email, password: pass })
            });
            if (tr.status === 200) {
              mailToken = ((await tr.json()) as any).token;
            }
          }

          if (mailToken) {
            break;
          }
          console.warn(`[MAIL.TM] Setup attempt ${attempt} failed (create status: ${createResp.status}, token status: ${tokenResp.status}).`);
        } catch (e: any) {
          console.warn(`[MAIL.TM] Setup attempt ${attempt} error: ${e.message}`);
        }
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (!mailToken) {
        return { success: false, message: "Failed to authenticate with mail.tm after 3 attempts." };
      }
    }

    const mailHeaders = { "Authorization": `Bearer ${mailToken}` };

    // Initial wait — give CarX time to send the email
    await new Promise(r => setTimeout(r, POLL_INITIAL_MS));

    console.log(`[MAIL.TM] Polling inbox for ${email} (every ${POLL_INTERVAL_MS}ms, up to ${MAX_ATTEMPTS} attempts = ${(MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000).toFixed(0)}s)...`);
    let verificationCode = "";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      try {
        const listResp = await fetch(`${mailApiUrl}/messages`, { headers: mailHeaders });
        if (listResp.status !== 200) {
          console.warn(`[MAIL.TM] inbox list status ${listResp.status} on attempt ${attempt + 1}`);
          if (listResp.status === 429) {
            // Backoff on rate limit
            await new Promise(r => setTimeout(r, 2500));
          }
          continue;
        }

        const messages = ((await listResp.json()) as any)["hydra:member"] || [];
        if (messages.length === 0) continue;

        // Check all messages, not just the first, in case of ordering issues
        for (const msg of messages) {
          const msgResp = await fetch(`${mailApiUrl}/messages/${msg.id}`, { headers: mailHeaders });
          if (msgResp.status !== 200) continue;

          const msgData = await msgResp.json() as any;

          // Better HTML stripping: decode entities & strip tags
          const rawHtml: string = Array.isArray(msgData.html)
            ? msgData.html.join(" ")
            : (msgData.html || "");
          const strippedHtml = rawHtml
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#\d+;/g, " ");

          const candidates = [
            msgData.text || "",
            strippedHtml,
            msg.subject || ""
          ];

          for (const candidate of candidates) {
            const code = extractCode(candidate);
            if (code) {
              verificationCode = code;
              console.log(`[MAIL.TM] ✅ Found code: ${code} (attempt ${attempt + 1}/${MAX_ATTEMPTS}, msg: ${msg.subject || msg.id})`);
              break;
            }
          }
          if (verificationCode) break;
        }

        if (verificationCode) break;
      } catch (pollErr: any) {
        console.warn(`[MAIL.TM] Poll attempt ${attempt + 1} error: ${pollErr.message}`);
        continue;
      }
    }

    if (!verificationCode) {
      return { success: false, message: `Verification email not received within ${(MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000).toFixed(0)}s.` };
    }

    // Retry verify up to 3x on transient failure
    console.log(`[MAIL.TM] Submitting code '${verificationCode}' to CarX for ${email}...`);
    for (let vAttempt = 0; vAttempt < 3; vAttempt++) {
      const verifyResult = await CarXClient.verifyAccount(email, pass, verificationCode, carxToken, deviceId, uniqueId);
      if (verifyResult.success) {
        return { success: true, message: "Account successfully verified!", code: verificationCode };
      }
      if (vAttempt < 2) {
        console.log(`[MAIL.TM] Verify attempt ${vAttempt + 1} failed (${verifyResult.message}), retrying...`);
        await new Promise(r => setTimeout(r, 1500));
      } else {
        return { success: false, message: verifyResult.message || "Failed to verify account on CarX." };
      }
    }

    return { success: false, message: "Verification failed after retries." };

  } catch (e: any) {
    return { success: false, message: e.message || "Error during mail.tm auto-verification" };
  }
}


function randomizePattern(pattern: string, isPassword = false) {
  const isPlaceholder = pattern.toLowerCase().includes("x");
  if (!isPlaceholder) {
    const suffix = crypto.randomBytes(3).toString("hex").substring(0, 6);
    if (isPassword) return pattern + suffix;
    if (pattern.includes("@")) {
      const parts = pattern.split("@");
      return `${parts[0]}${suffix}@${parts[1]}`;
    }
    return `${pattern}${suffix}@web-library.net`;
  }

  return pattern.split("").map(char => {
    if (char === 'x') {
      return "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)];
    }
    if (char === 'X') {
      return "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)];
    }
    return char;
  }).join("");
}

// Bulk generate account trigger
app.post(["/api/carx/bulk-generate", "/carx/bulk-generate"], authMiddleware, async (req, res) => {
  const {
    count,
    email_template,
    password,
    cash,
    gold,
    exp,
    get_all_cars,
    regular_cars,
    premium_cars,
    cars_mode,
    unlock_all,
    unlock_clubs,
    inject_bp,
    verify,
    unlock_profile_style
  } = req.body;
  const jobCount = count ? Math.min(30, Math.max(1, parseInt(count, 10))) : 5;

  let costPerAccount = 3; // base resource quantities cost 3
  if (get_all_cars || regular_cars || premium_cars || (cars_mode && cars_mode !== "none")) costPerAccount += 4;
  if (unlock_all || unlock_clubs) costPerAccount += 3;
  if (inject_bp) costPerAccount += 5;
  const totalCost = jobCount * costPerAccount;

  const role = (req as any).role;
  const licenseKey = (req as any).licenseKey;

  // 1. Verify bulk_generate feature and credit balance
  const check = await checkAndDeductCredit(licenseKey, role, "bulk_generate", totalCost);
  if (!check.success) {
    return res.status(check.message?.includes("Access Denied") ? 403 : 402).json({ success: false, message: check.message });
  }

  // 2. Deduct credits upfront
  if (role !== "owner" && licenseKey !== OWNER_KEY) {
    const db = check.db;
    const keyData = db.keys[licenseKey];
    if (keyData) {
      const currentCredits = getKeyCredits(keyData);
      if (currentCredits !== -1) {
        keyData.credits = Math.max(0, currentCredits - totalCost);
        delete keyData.tokens;
        if (keyData.credits === 0) {
          keyData.out_of_credits = true;
          delete keyData.out_of_tokens;
        }
      }
      db.total_credits_used = (db.total_credits_used || 0) + totalCost;
      await saveKeysDb(db);
      console.log(`[CREDITS] Deducted upfront ${totalCost} credits from key ${licenseKey} for bulk generation.`);
    }
  } else {
    // Owner is doing bulk generation. Update total credits used in keys database.
    const db = await loadKeysDb();
    db.total_credits_used = (db.total_credits_used || 0) + totalCost;
    await saveKeysDb(db);
  }

  const jobId = crypto.randomUUID();
  bulkJobs[jobId] = {
    status: "running",
    progress: 0,
    total: jobCount,
    logs: ["⚙️ Starting Bulk Generation process..."],
    results: []
  };

  // Run the background generation thread
  const job = bulkJobs[jobId];
  const cashParsed = parseResourceValue(cash, 0, MAX_CASH, "cash");
  if (!cashParsed.ok) {
    job.status = "cancelled";
    return res.status(400).json({ success: false, message: cashParsed.message });
  }
  const goldParsed = parseResourceValue(gold, 0, MAX_GOLD, "gold");
  if (!goldParsed.ok) {
    job.status = "cancelled";
    return res.status(400).json({ success: false, message: goldParsed.message });
  }
  const expParsed = parseResourceValue(exp, 1, MAX_EXP, "exp");
  if (!expParsed.ok) {
    job.status = "cancelled";
    return res.status(400).json({ success: false, message: expParsed.message });
  }
  const cashVal = cashParsed.value ?? MAX_CASH;
  const goldVal = goldParsed.value ?? MAX_GOLD;
  const expVal = expParsed.value ?? MAX_EXP;

  async function generateJobs() {
    let completedCount = 0;
    // Limit concurrency to 3 when email verification is on to prevent mail.tm 429 rate limit errors
    const CONCURRENCY = verify ? Math.min(3, jobCount) : Math.min(12, jobCount);
    const tasks = Array.from({ length: jobCount }, (_, i) => i);

    // Resolve the live mail.tm domain once for the whole job (only needed when verify is on)
    let activeDomain = "web-library.net";
    if (verify && (!email_template || email_template.endsWith("@web-library.net"))) {
      try {
        activeDomain = await getMailTmDomain();
        if (activeDomain !== "web-library.net") {
          job.logs.push(`📡 Using live mail.tm domain: @${activeDomain}`);
        }
      } catch { /* keep default */ }
    }

    async function worker() {
      while (tasks.length > 0 && job.status === "running") {
        const i = tasks.shift()!;

        // Resolve dynamic template domain based on verification state
        let effectiveTemplate = email_template;
        if (!effectiveTemplate) {
          effectiveTemplate = verify ? `carxmingxxxxxxx@${activeDomain}` : `carxmingxxxxxxx@gmail.com`;
        } else {
          // If not verifying, force default web-library.net / mail.tm domains to gmail.com
          if (!verify && (effectiveTemplate.endsWith("@web-library.net") || (activeDomain && effectiveTemplate.endsWith(`@${activeDomain}`)))) {
            effectiveTemplate = effectiveTemplate.split("@")[0] + "@gmail.com";
          }
        }
        const email = randomizePattern(effectiveTemplate);
        const pass = randomizePattern(password || "RMStoreXXXXXX", true);

        job.logs.push(`⚙️ [${i + 1}/${jobCount}] Registering: ${email}`);

        // ⚡ PARALLEL: mailbox creation + CarX registration fire simultaneously
        // This eliminates the sequential delay — both complete in the time of the slower one
        let mailToken: string | null = null;
        let regRes: Awaited<ReturnType<typeof CarXClient.authenticate>>;

        if (verify) {
          const [mbToken, reg] = await Promise.all([
            precreateMailbox(email, pass),
            CarXClient.authenticate("register", email, pass)
          ]);
          mailToken = mbToken;
          regRes = reg;
          if (!mailToken) {
            job.logs.push(`  └─ ⚠️ Mailbox pre-create failed — autoVerify will retry internally`);
          }
        } else {
          regRes = await CarXClient.authenticate("register", email, pass);
        }

        try {
          if (!regRes.success) {
            job.logs.push(`  └─ ❌ Reg Failed for ${email}: ${regRes.message}`);
            job.results.push({ email, status: "failed", message: regRes.message });
            completedCount++;
            job.progress = Math.round((completedCount / jobCount) * 100);
            continue;
          }

          const token = regRes.token;
          const userId = regRes.userId;
          const deviceId = regRes.deviceId;
          const uniqueId = regRes.uniqueId;

          // Verify account if requested — mailToken already obtained in parallel above
          if (verify) {
            job.logs.push(`  └─ ⚡ Auto-verifying ${email} via mail.tm...`);
            const verifyRes = await autoVerifyMailtm(email, pass, token, deviceId, uniqueId, mailToken);
            if (verifyRes.success) {
              job.logs.push(`  └─ ✅ Verified! Code: ${verifyRes.code}`);
            } else {
              job.logs.push(`  └─ ⚠️ Verification failed: ${verifyRes.message}`);
            }
          }

          // Run BP verify and profile get in parallel
          const bpPromise = (inject_bp && token)
            ? (() => {
              job.logs.push(`  └─ 🎟 Verifying Premium StreetPass for ${email}...`);
              const bpObj = JSON.parse(STREETPASS_BODY);
              return CarXClient.verifyStreetPass(token, bpObj, deviceId, uniqueId);
            })()
            : Promise.resolve(false);

          const profilePromise = CarXClient.getProfile(token, userId, deviceId, uniqueId);

          const [bpOk, profileResult] = await Promise.all([bpPromise, profilePromise]);

          if (inject_bp) {
            job.logs.push(bpOk ? `  └─ 🎟 StreetPass Activated for ${email}!` : `  └─ ⚠️ StreetPass Failed/Timeout for ${email}`);
          }

          const { profile, response, isWrappedInD, isWrappedInData } = profileResult;
          const level = expVal >= 93060 ? 50 : 1;

          const isRegCars = regular_cars === true || cars_mode === "regular";
          const isPremCars = premium_cars === true || cars_mode === "premium" || (get_all_cars !== false && cars_mode !== "regular");

          const profileMods: Parameters<typeof modifyProfile>[1] = {
            cash: cashVal,
            gold: goldVal,
            level,
            exp: expVal,
            unlock_clubs: unlock_clubs !== false,
            get_all_cars: !isRegCars && isPremCars,
            regular_cars: isRegCars,
            premium_cars: isPremCars,
            cars_package: isRegCars ? "regular" : "premium",
            unlock_houses: unlock_all !== false
          };

          if (unlock_profile_style !== false) {
            const randIdx = Math.floor(Math.random() * 16) + 1;
            profileMods.unlock_profile_style = true;
            profileMods.avatar = `avatar_${randIdx}`;
            profileMods.banner = `banner_${randIdx}`;
            profileMods.frame = `frame_${randIdx}`;
          }

          const modified = modifyProfile(profile || PROFILE_TEMPLATE, profileMods, userId);

          // Set quest completion
          if (unlock_all !== false || !profile) {
            modified.quests = PROFILE_TEMPLATE ? structuredClone(PROFILE_TEMPLATE.quests) : {};
          }

          // Upload Profile
          const upload = await CarXClient.uploadProfile(token, modified, userId, response, isWrappedInD, isWrappedInData, deviceId, uniqueId);
          if (upload.success) {
            job.logs.push(`  └─ ✅ Injected Profile [OK] for ${email}`);
            job.results.push({ email, password: pass, status: "success", user_id: userId });
          } else {
            const errText = upload.response ? await upload.response.text() : "No server response";
            job.logs.push(`  └─ ❌ Injection Failed for ${email}: ${errText}`);
            job.results.push({ email, status: "failed", message: errText });
          }
        } catch (e: any) {
          job.logs.push(`  └─ ❌ Error for ${email}: ${e.message || e}`);
          job.results.push({ email, status: "failed", message: e.message || "Exception error" });
        }

        completedCount++;
        job.progress = Math.round((completedCount / jobCount) * 100);
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, jobCount) }, () => worker());
    await Promise.all(workers);

    // Save generated count
    const successCount = job.results.filter(r => r.status === "success").length;
    if (successCount > 0) {
      try {
        const db = await loadKeysDb();
        db.total_accounts_generated = (db.total_accounts_generated || 0) + successCount;
        await saveKeysDb(db);
      } catch (err) {
        console.error("[TELEMETRY ERROR] Failed to save accounts count:", err);
      }
    }

    if (job.status === "cancelled") {
      job.logs.push("❌ Process terminated by user.");
    } else if (job.status === "running") {
      job.status = "completed";
      job.logs.push("🎉 Bulk generation completed successfully.");
    }
  }

  generateJobs();

  const remCredits = await getRemainingCreditsGlobal(licenseKey, role);
  res.json({ success: true, jobId, message: "Bulk generation started.", ...creditResponse(remCredits) });
});

// Check Bulk status
app.get(["/api/carx/bulk-status/:jobId", "/carx/bulk-status/:jobId"], authMiddleware, (req, res) => {
  const { jobId } = req.params;
  const job = bulkJobs[jobId];
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found or expired." });
  }
  res.json({ success: true, job });
});

// Terminate Bulk Job
app.post(["/api/carx/bulk-cancel/:jobId", "/carx/bulk-cancel/:jobId"], authMiddleware, (req, res) => {
  const { jobId } = req.params;
  const job = bulkJobs[jobId];
  if (!job) {
    return res.status(404).json({ success: false, message: "Job not found." });
  }
  job.status = "cancelled";
  res.json({ success: true, message: "Cancellation request received." });
});

// Server configuration for development vs production
// Keep alive function to prevent hosting services (like Render) from sleeping
function startKeepAlive() {
  const url = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || process.env.APP_URL;
  if (url) {
    console.log(`[Keep-Alive] Initializing self-ping 24h keep-alive for URL: ${url}`);
    // Ping every 5 minutes (300000 ms)
    setInterval(async () => {
      try {
        const res = await fetch(url);
        await res.text().catch(() => "");
        console.log(`[Keep-Alive] Self-ping successful: ${url} (Status: ${res.status})`);
      } catch (err: any) {
        console.error(`[Keep-Alive] Self-ping failed for ${url}:`, err.message || err);
      }
    }, 5 * 60 * 1000);
  } else {
    console.log("[Keep-Alive] No RENDER_EXTERNAL_URL or PUBLIC_URL defined. Self-ping inactive.");
  }
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Rymenbot Web Panel Server] Listening on http://0.0.0.0:${PORT}`);
    startKeepAlive();
  });
}

if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
