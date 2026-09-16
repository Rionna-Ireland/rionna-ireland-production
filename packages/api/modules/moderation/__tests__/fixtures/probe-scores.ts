/**
 * S12-07 probe (2026-09-16) — omni-moderation-latest category scores (≥ 0.01
 * kept) for the racing-jargon corpus. `legit` must never block; `caught`
 * must always block. Abusive text is deliberately not committed.
 * Re-run: tooling/scripts/moderation-provider-probe.ts.
 */
import type { CategoryScores } from "../../auto-thresholds";

export interface ProbeSample {
	id: string;
	note: string;
	scores: CategoryScores;
}

export const LEGIT_SAMPLES: ProbeSample[] = [
	{ id: "L01", note: "He was whipped out of it in the last furlong but j", scores: { violence: 0.0474 } },
	{ id: "L02", note: "Jockey got a 4 day ban for excessive use of the wh", scores: { violence: 0.0717 } },
	{ id: "L03", note: "Vet confirmed he bled from the nose after Saturday", scores: { "self-harm": 0.012, violence: 0.2025, "violence/graphic": 0.0892 } },
	{ id: "L04", note: "Poor lad is a known bleeder, trainer wants to try ", scores: {} },
	{ id: "L05", note: "The stud fee for his sire went up to 40k this year", scores: {} },
	{ id: "L06", note: "She's heading to the stud in Kildare to be covered", scores: { sexual: 0.0522 } },
	{ id: "L07", note: "He was a rig so they had to operate before he coul", scores: {} },
	{ id: "L08", note: "Still an entire, which explains why he was so colt", scores: {} },
	{ id: "L09", note: "Trainer says he'll be cut over the winter, gelding", scores: { violence: 0.0871 } },
	{ id: "L10", note: "Gelded in the summer and he's a different horse no", scores: {} },
	{ id: "L11", note: "Still a maiden after 7 runs but I think a mile and", scores: {} },
	{ id: "L12", note: "Tongue tie goes on for the first time at Leopardst", scores: {} },
	{ id: "L13", note: "Sad news, he broke down on the gallops this mornin", scores: { violence: 0.016 } },
	{ id: "L14", note: "Devastated to share that she fractured a leg at th", scores: { "self-harm": 0.0147, violence: 0.5171, "violence/graphic": 0.0501 } },
	{ id: "L15", note: "The horse was destroyed on the track after a fatal", scores: { violence: 0.3513, "violence/graphic": 0.0162 } },
	{ id: "L16", note: "He was humanely euthanised by the course vet, noth", scores: { violence: 0.0714 } },
	{ id: "L17", note: "Choked badly two out and dropped right away, going", scores: { violence: 0.1868, "violence/graphic": 0.0162 } },
	{ id: "L18", note: "Got absolutely stuffed at Punchestown, lost my shi", scores: {} },
	{ id: "L19", note: "I got hammered at the bookies on Saturday, never a", scores: {} },
	{ id: "L20", note: "Lumped on at 12/1 this morning, he's into 5s now.", scores: {} },
	{ id: "L21", note: "Each way double on our two runners Thursday, who's", scores: {} },
	{ id: "L22", note: "Bookies knocked me back to a fiver max bet, they h", scores: {} },
	{ id: "L23", note: "That ride was criminal, the jockey should be shot.", scores: { harassment: 0.1444, "harassment/threatening": 0.1132, illicit: 0.0285, "illicit/violent": 0.0182, violence: 0.6214 } },
	{ id: "L24", note: "Absolute butcher of a ride, he murdered that horse", scores: { harassment: 0.1072, violence: 0.3588, "violence/graphic": 0.0161 } },
	{ id: "L25", note: "I could kill the handicapper, 6lbs for winning a s", scores: { harassment: 0.6478, "harassment/threatening": 0.5291, hate: 0.1231, "hate/threatening": 0.0298, illicit: 0.1698, "illicit/violent": 0.091, violence: 0.9212 } },
	{ id: "L26", note: "The stewards are blind, they want their heads exam", scores: { harassment: 0.1419, hate: 0.02, violence: 0.0231 } },
	{ id: "L27", note: "He's a useless yoke on soft ground, don't bother b", scores: { harassment: 0.8018 } },
	{ id: "L28", note: "We got robbed in the photo finish, daylight robber", scores: { violence: 0.0234 } },
	{ id: "L29", note: "Paddy you owe me a pint after that tip, you eejit.", scores: { harassment: 0.8425 } },
	{ id: "L30", note: "Photos from the vet: nasty gash on his near hind, ", scores: { violence: 0.2009, "violence/graphic": 0.1083 } },
	{ id: "L31", note: "Tendon injury, blood everywhere in the horsebox, h", scores: { illicit: 0.0166, violence: 0.4225, "violence/graphic": 0.2035 } },
	{ id: "L32", note: "He cut himself to ribbons on the rail at the last,", scores: { "self-harm": 0.5244, "self-harm/intent": 0.0672, "self-harm/instructions": 0.0106, violence: 0.5135, "violence/graphic": 0.1761 } },
	{ id: "L33", note: "He hung badly left and nearly took out the runner-", scores: { "self-harm": 0.0185, violence: 0.3568, "violence/graphic": 0.0164 } },
	{ id: "L34", note: "Pulled up lame, trainer thinks it's a bruised foot", scores: { violence: 0.1252 } },
	{ id: "L35", note: "Dam was a smashing broodmare, threw three black ty", scores: {} },
	{ id: "L36", note: "The filly came into season on the morning of the r", scores: { sexual: 0.0213 } },
	{ id: "L37", note: "Teaser was brought in to check if the mare was rea", scores: { sexual: 0.0991 } },
	{ id: "L38", note: "Blinkers and a hood on today, he's a bit of a thin", scores: {} },
	{ id: "L39", note: "He was given a kick in the belly at the top of the", scores: { violence: 0.4017 } },
	{ id: "L40", note: "Jockey gave him a smack down the shoulder and he q", scores: { sexual: 0.0194, violence: 0.524 } },
	{ id: "L41", note: "Beaten a short head by a horse who was drugged to ", scores: { illicit: 0.0115, violence: 0.8108, "violence/graphic": 0.146 } },
	{ id: "L42", note: "Another trainer banned for doping, the sport needs", scores: {} },
	{ id: "L43", note: "The BHA found traces of cocaine in the jockey's sa", scores: {} },
	{ id: "L44", note: "Anyone know a good way to get the stable lads to s", scores: { illicit: 0.6828, "illicit/violent": 0.0197 } },
	{ id: "L45", note: "The Grand National is barbaric, horses die every y", scores: { violence: 0.1241 } },
	{ id: "L46", note: "Animal rights protesters glued themselves to the r", scores: { violence: 0.0474 } },
	{ id: "L47", note: "I was gutted, honestly cried in the car park after", scores: { violence: 0.1007 } },
	{ id: "L48", note: "Losing that horse nearly killed me, he was part of", scores: { violence: 0.4203, "violence/graphic": 0.0161 } },
	{ id: "L49", note: "Been a tough year with my health but this syndicat", scores: {} },
	{ id: "L50", note: "Great day out at Galway, the craic was mighty and ", scores: {} },
	{ id: "L51", note: "Can anyone give me a lift from Naas to Punchestown", scores: { illicit: 0.0184 } },
	{ id: "L52", note: "Welcome to all the new members, delighted to have ", scores: {} },
	{ id: "L53", note: "Trainer update: she worked well this morning and i", scores: {} },
	{ id: "L54", note: "He's a big strapping beast, all muscle, you'd want", scores: { sexual: 0.0204 } },
	{ id: "L55", note: "Naked eye he looks sound, but they're going to X-r", scores: { sexual: 0.036, violence: 0.0103 } },
	{ id: "L56", note: "Travellers' horse fair in Ballinasloe is worth a v", scores: {} },
	{ id: "L57", note: "The English lads came over and cleaned us out at C", scores: {} },
	{ id: "L58", note: "Horse was scratched after he kicked the stalls and", scores: { violence: 0.5226, "violence/graphic": 0.1765 } },
	{ id: "L59", note: "Place a few quid on for me will ya, I'll send you ", scores: {} },
	{ id: "L60", note: "He's had his throat cauterised and a tie-back op, ", scores: { violence: 0.2018, "violence/graphic": 0.0503 } },
];

export const CAUGHT_ABUSE_SAMPLES: ProbeSample[] = [
	{ id: "A01", note: "harassment", scores: { harassment: 0.977 } },
	{ id: "A03", note: "harassment", scores: { harassment: 0.9789 } },
	{ id: "A04", note: "harassment", scores: { harassment: 0.9807, hate: 0.0201, sexual: 0.0104 } },
	{ id: "A06", note: "harassment/threatening", scores: { harassment: 0.8013, "harassment/threatening": 0.7409, illicit: 0.0202, violence: 0.9423 } },
	{ id: "A09", note: "hate", scores: { harassment: 0.8945, hate: 0.8278 } },
	{ id: "A10", note: "hate", scores: { harassment: 0.8916, hate: 0.6992 } },
	{ id: "A11", note: "hate", scores: { harassment: 0.9806, "harassment/threatening": 0.7402, hate: 0.9572, violence: 0.0163 } },
	{ id: "A12", note: "hate", scores: { harassment: 0.9789, hate: 0.865 } },
	{ id: "A13", note: "hate/threatening", scores: { harassment: 0.739, "harassment/threatening": 0.7445, hate: 0.387, "hate/threatening": 0.2426, illicit: 0.2048, "illicit/violent": 0.0947, violence: 0.6407 } },
	{ id: "A14", note: "hate/threatening", scores: { harassment: 0.9818, "harassment/threatening": 0.9986, hate: 0.9993, "hate/threatening": 0.9983, illicit: 0.114, "illicit/violent": 0.0315, violence: 0.9999 } },
	{ id: "A17", note: "violence/graphic", scores: { harassment: 0.4002, "harassment/threatening": 0.5246, hate: 0.0134, illicit: 0.0306, "illicit/violent": 0.0125, violence: 0.8663, "violence/graphic": 0.7137 } },
	{ id: "A20", note: "sexual", scores: { sexual: 0.9264, violence: 0.0234 } },
	{ id: "A21", note: "sexual", scores: { sexual: 0.5773 } },
	{ id: "A22", note: "sexual/minors", scores: { sexual: 0.2883, "sexual/minors": 0.2003 } },
	{ id: "A23", note: "self-harm", scores: { "self-harm": 0.7695, "self-harm/intent": 0.715, violence: 0.4234, "violence/graphic": 0.0496 } },
	{ id: "A24", note: "self-harm/intent", scores: { "self-harm": 0.8654, "self-harm/intent": 0.9023, violence: 0.2014 } },
	{ id: "A25", note: "self-harm/intent", scores: { "self-harm": 0.9766, "self-harm/intent": 0.9987, violence: 0.5119 } },
	{ id: "A26", note: "self-harm/instructions", scores: { "harassment/threatening": 0.0194, illicit: 0.1695, "illicit/violent": 0.0442, "self-harm": 0.8604, "self-harm/intent": 0.8175, "self-harm/instructions": 0.7833, violence: 0.4209 } },
	{ id: "A31", note: "illicit/violent", scores: { illicit: 0.954, "illicit/violent": 0.6685, violence: 0.0163 } },
	{ id: "A40", note: "hate", scores: { harassment: 0.9811, hate: 0.9979 } },
];
