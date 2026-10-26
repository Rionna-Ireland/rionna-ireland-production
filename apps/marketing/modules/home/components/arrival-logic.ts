export const ARRIVAL_KEY = "rionna:arrived";

type ArrivalStorage = Pick<Storage, "getItem" | "setItem">;

// Locale root only: `/`, `/en`, `/en/`, `/pt-br/`.
const HOME_PATH = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/i;

/** True once per browser session on the home page; fails open (plays) when storage is missing or throws. */
export function shouldPlayArrival(storage: ArrivalStorage | null, pathname = "/"): boolean {
	if (!HOME_PATH.test(pathname)) return false;
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
export const ARRIVAL_INLINE_SCRIPT = `try{if(${HOME_PATH}.test(location.pathname)){var s=sessionStorage;if(s.getItem("${ARRIVAL_KEY}")==="1")document.documentElement.dataset.arrival="seen";else s.setItem("${ARRIVAL_KEY}","1")}}catch(e){}`;
