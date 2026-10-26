export const ARRIVAL_KEY = "rionna:arrived";

type ArrivalStorage = Pick<Storage, "getItem" | "setItem">;

/** True once per browser session; fails open (plays) when storage is missing or throws. */
export function shouldPlayArrival(storage: ArrivalStorage | null): boolean {
	try {
		if (!storage) return true;
		if (storage.getItem(ARRIVAL_KEY) === "1") return false;
		storage.setItem(ARRIVAL_KEY, "1");
		return true;
	} catch {
		return true;
	}
}

// Same logic as shouldPlayArrival, inlined for the <head> (runs before first paint).
export const ARRIVAL_INLINE_SCRIPT = `try{var s=sessionStorage;if(s.getItem("${ARRIVAL_KEY}")==="1")document.documentElement.dataset.arrival="seen";else s.setItem("${ARRIVAL_KEY}","1")}catch(e){}`;
