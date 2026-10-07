import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app);

async function check() {
  try {
    console.log("Checking Firestore collections...");
    const snap = await getDocs(query(collection(db, "resources"), limit(500)));
    console.log("Found in resources collection:", snap.size);
    const userIds = new Map<string, number>();
    snap.forEach(d => {
      const data = d.data();
      const uid = data.userId || "no-userId";
      userIds.set(uid, (userIds.get(uid) || 0) + 1);
    });
    console.log("Counts per userId:", Object.fromEntries(userIds));
  } catch (err: any) {
    console.error("Error reading Firestore:", err.message);
  }
  process.exit(0);
}

check();
