/**
 * S13-17 showcase fixtures. Everything the staging seed creates is described
 * here so the copy can be reviewed in one place.
 *
 * Brand voice: warm, "one of us", Irish racing, no lorem. EVERYONE below is
 * fictional (trainer, jockeys, members). Horse names are invented; racecourses
 * and place names are real because they are places, not people.
 *
 * Image licences and sources: see ./CREDITS.md. Videos are YouTube links
 * (Circle embeds them via oEmbed); swap VIDEO_URL for a club clip any time.
 */

const img = (photoId: string, w = 1600) =>
	`https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${w}&q=80`;

export const IMAGES = {
	// Horses (portraits / paddock)
	bayFilly: img("1597119275334-359a0ccb6ae4"),
	chestnutColt: img("1504310977373-186d29f99322"),
	greyMare: img("1645688917371-9259d6a549f6"),
	darkGelding: img("1552632940-c79eed47dc06"),
	greyGelding: img("1645688917394-cfc228b20324"),
	bayMare: img("1605138673093-e333752f46df"),
	horseField: img("1694446909080-ace9b262224a"),
	horseCloseUp: img("1641226469021-f81abb75108c"),
	// Yard
	barn: img("1682636109994-4f2bbee2fd72"),
	stalls: img("1576692192914-9abed71b3ef9"),
	stableWindow: img("1654693519854-175cee0fa7d6"),
	tackRoom: img("1682636109270-93cb7b720716"),
	// Racing
	racingSnow: img("1507514604110-ba3347c457f6"),
	jockey: img("1516673699707-4f2a243fafaf"),
	gallop: img("1694446942933-bc29e37df9f3"),
	raceStart: img("1635895901494-539a6b2647af"),
	raceBend: img("1526094798790-1df6f28275cc"),
	raceClose: img("1495543377553-b2aba1f925d7"),
	racePack: img("1526094633853-031707a44819"),
	raceFinish: img("1475539175801-4f770d7d1a49"),
	// Landscape / lifestyle
	greenFields: img("1596039677662-90c00fbde9b5"),
	hills: img("1592317460245-765f641e122b"),
	stoneHouse: img("1681300148813-7a1846434c61"),
	dinner: img("1574966739987-65e38db0f7ce"),
	restaurant: img("1570560258879-af7f8e1447ac"),
	hotelRoom: img("1611892440504-42a792e24d32"),
	hotelBed: img("1618773928121-c32242e63f39"),
	hotelSuite: img("1711059985570-4c32ed12a12c"),
} as const;

/**
 * Stand-in clip (Blender's Big Buck Bunny, CC BY 3.0). Replace with a real
 * Rionna/yard clip when one exists; one constant, used by every video fixture.
 */
export const VIDEO_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface PersonaFixture {
	key: string;
	name: string;
}

/** Circle members created as `<local>+seed-<key>@<domain>`. All fictional. */
export const PERSONAS: PersonaFixture[] = [
	{ key: "maeve", name: "Maeve Gallagher" },
	{ key: "donal", name: "Dónal Whelan" },
	{ key: "siobhan", name: "Siobhán Keane" },
	{ key: "ciaran", name: "Ciarán Doyle" },
	{ key: "niamh", name: "Niamh Brennan" },
	{ key: "eamon", name: "Eamon Fitzgerald" },
	{ key: "roisin", name: "Róisín Cullen" },
	{ key: "tadhg", name: "Tadhg Moloney" },
];

export const TRAINER = {
	key: "cormac",
	name: "Cormac Dunleavy",
	location: "Kildare",
} as const;

export const JOCKEYS = [
	"Aoife Tierney",
	"Seán Fogarty",
	"Pádraig Meaney",
	"Conor Hanratty",
] as const;

// ---------------------------------------------------------------------------
// Racing
// ---------------------------------------------------------------------------

export type HorseSexFixture = "FILLY" | "COLT" | "MARE" | "GELDING" | "STALLION";

export interface RunFixture {
	/** Days before the seed time. */
	daysAgo: number;
	course: string;
	country: "IRE" | "GB";
	race: string;
	raceType: "Flat" | "Hurdle" | "Chase" | "NH Flat";
	furlongs: number;
	going: string;
	className: string;
	/** Finishing position; the field size is `field`. */
	position: number;
	field: number;
	beatenLengths?: number;
	jockey: (typeof JOCKEYS)[number];
	comment: string;
	replayUrl?: string;
}

export interface UpcomingFixture {
	/** Hours from the seed time to the off. */
	inHours: number;
	course: string;
	country: "IRE" | "GB";
	race: string;
	raceType: RunFixture["raceType"];
	furlongs: number;
	going: string;
	className: string;
	status: "DECLARED" | "NON_RUNNER" | "ENTERED";
	draw?: number;
	weightLbs?: number;
	jockey?: (typeof JOCKEYS)[number];
}

export type UpdateType = "trainer" | "wellbeing" | "general" | "race";

export interface HorseUpdateFixture {
	key: string;
	type: UpdateType;
	title: string;
	body: string;
	daysAgo: number;
	/** Photo update: also posted to the horse's Circle space with this image. */
	imageUrl?: string;
	/** Video update: also posted to the horse's Circle space with this embed. */
	videoUrl?: string;
}

export interface HorseFixture {
	key: string;
	name: string;
	sex: HorseSexFixture;
	colour: string;
	foaledOn: string;
	foaledPlace: string;
	foaledCountry: "IRE" | "GB" | "FR";
	sire: string;
	dam: string;
	damsire: string;
	status: "IN_TRAINING" | "REHAB" | "PRE_TRAINING";
	bio: string;
	story: string;
	trainerNotes: string;
	ownershipBlurb: string;
	photos: { url: string; caption: string }[];
	sortOrder: number;
	inviteOnly?: boolean;
	/** Tom's account follows this horse (a mix of following / not following). */
	followedByTom: boolean;
	wellbeing: {
		vetCheck: "ALL_CLEAR" | "MONITORING" | "TREATMENT";
		vetCheckedDaysAgo: number;
		load: "RESTING" | "LIGHT" | "BUILDING" | "FULL";
	};
	runs: RunFixture[];
	upcoming?: UpcomingFixture;
	updates: HorseUpdateFixture[];
}

export const HORSES: HorseFixture[] = [
	{
		key: "hawthorn-ridge",
		name: "Hawthorn Ridge",
		sex: "FILLY",
		colour: "Bay",
		foaledOn: "2023-04-12",
		foaledPlace: "Co. Meath",
		foaledCountry: "IRE",
		sire: "Kingsfold",
		dam: "Blackthorn Winter",
		damsire: "Galtee Prince",
		status: "IN_TRAINING",
		bio: "A neat, athletic bay filly with a big white sock behind and a lovely way of going. Quick to learn and quicker still on the gallops.",
		story: "Foaled in a Meath paddock on a wet April night, Hawthorn Ridge was the last of the crop to get to her feet and the first to find the gate. Cormac broke her himself in the spring of her two-year-old year and has said more than once that he has not had a filly pick things up so cleanly. She won her maiden on soft ground at Naas and has been placed in her last two starts since, each time finishing like a train. The plan is to keep her over a mile and a quarter and see whether she wants more.",
		trainerNotes:
			"Settles beautifully in her work now. Better on an easy surface. Mile and a quarter is the current target.",
		ownershipBlurb: "Owned by the Rionna club: every member has a share of her story.",
		photos: [
			{ url: IMAGES.bayFilly, caption: "Hawthorn Ridge in the paddock, early morning" },
			{ url: IMAGES.horseField, caption: "Out in the field after a good gallop" },
		],
		sortOrder: 1,
		followedByTom: true,
		wellbeing: { vetCheck: "ALL_CLEAR", vetCheckedDaysAgo: 4, load: "BUILDING" },
		runs: [
			{
				daysAgo: 12,
				course: "Naas",
				country: "IRE",
				race: "Rionna Mares Handicap",
				raceType: "Flat",
				furlongs: 10,
				going: "Soft",
				className: "Class 4",
				position: 2,
				field: 11,
				beatenLengths: 0.75,
				jockey: "Aoife Tierney",
				comment: "Stayed on strongly late and was only just held. Looks to be improving.",
			},
			{
				daysAgo: 41,
				course: "Curragh",
				country: "IRE",
				race: "Kildare Fillies Maiden",
				raceType: "Flat",
				furlongs: 8,
				going: "Good to Soft",
				className: "Maiden",
				position: 3,
				field: 14,
				beatenLengths: 2.5,
				jockey: "Aoife Tierney",
				comment: "Green early, picked up well, would benefit from further.",
			},
			{
				daysAgo: 78,
				course: "Naas",
				country: "IRE",
				race: "Maiden Fillies Stakes",
				raceType: "Flat",
				furlongs: 8,
				going: "Soft",
				className: "Maiden",
				position: 1,
				field: 9,
				jockey: "Aoife Tierney",
				comment: "Won going away. A happy day for everyone.",
			},
			{
				daysAgo: 118,
				course: "Leopardstown",
				country: "IRE",
				race: "Debutantes Maiden",
				raceType: "Flat",
				furlongs: 7,
				going: "Good",
				className: "Maiden",
				position: 6,
				field: 12,
				beatenLengths: 6.25,
				jockey: "Seán Fogarty",
				comment: "Needed the experience. Ran on nicely once the penny dropped.",
			},
		],
		updates: [
			{
				key: "gallop-photo",
				type: "trainer",
				title: "Fast piece of work this morning",
				body: "Stepped up to a half-speed gallop on the all-weather with a lead horse. She moved through the bridle like she was on rails. Aoife was smiling when she pulled up.",
				daysAgo: 1,
				imageUrl: IMAGES.gallop,
			},
			{
				key: "vet-check",
				type: "wellbeing",
				title: "Vet check: all clear",
				body: "Routine post-race check after Naas. Trotted up sound, heart rate and recovery excellent, no heat or swelling anywhere. Cleared for a full week of work.",
				daysAgo: 4,
			},
			{
				key: "video-walk",
				type: "general",
				title: "Morning exercise in the mist",
				body: "A short clip of the string making their way up to the gallops. Hawthorn is the bay with the white sock, third from the front.",
				daysAgo: 7,
				videoUrl: VIDEO_URL,
			},
			{
				key: "race-recap",
				type: "race",
				title: "Second at Naas, and a proper run",
				body: "Beaten three-quarters of a length in a competitive handicap. Aoife said she had a bit more in the tank if the line had been a stride further. We will get her out again before the end of the month.",
				daysAgo: 12,
			},
			{
				key: "coat",
				type: "general",
				title: "Coat is coming through",
				body: "Autumn coat starting to come, so we have clipped her out and put a light rug on. Weight is spot on and she is eating everything we put in front of her.",
				daysAgo: 19,
			},
		],
	},
	{
		key: "kilcullen-boy",
		name: "Kilcullen Boy",
		sex: "COLT",
		colour: "Chestnut",
		foaledOn: "2022-03-02",
		foaledPlace: "Co. Kildare",
		foaledCountry: "IRE",
		sire: "Dunmore Star",
		dam: "Ballyhale Rose",
		damsire: "Mountain Fox",
		status: "IN_TRAINING",
		bio: "A flashy chestnut colt with a white blaze and plenty of presence. Loves a bit of company on the gallops and does everything with his ears pricked.",
		story: "Bought as a yearling for less than he looks, Kilcullen Boy has made the whole yard feel clever. He won his first two starts over a mile before running into a good one at the Curragh, and has been waiting for the right ground since. This week he is declared for a handicap at Naas on Saturday, and Cormac is quietly confident.",
		trainerNotes: "Likes good ground. Keen early, so a settled pace suits.",
		ownershipBlurb: "Owned by the Rionna club.",
		photos: [
			{ url: IMAGES.chestnutColt, caption: "Kilcullen Boy, fresh out of the wash box" },
			{ url: IMAGES.horseCloseUp, caption: "All ears" },
		],
		sortOrder: 2,
		followedByTom: true,
		wellbeing: { vetCheck: "ALL_CLEAR", vetCheckedDaysAgo: 2, load: "FULL" },
		runs: [
			{
				daysAgo: 29,
				course: "Curragh",
				country: "IRE",
				race: "Kildare Handicap",
				raceType: "Flat",
				furlongs: 8,
				going: "Good",
				className: "Class 3",
				position: 4,
				field: 16,
				beatenLengths: 3.25,
				jockey: "Seán Fogarty",
				comment:
					"Raced a touch keenly and was short of room at a crucial stage. Better than the result.",
			},
			{
				daysAgo: 63,
				course: "Leopardstown",
				country: "IRE",
				race: "Club Colts Stakes",
				raceType: "Flat",
				furlongs: 8,
				going: "Good to Firm",
				className: "Class 4",
				position: 1,
				field: 10,
				jockey: "Seán Fogarty",
				comment: "Made all and kept finding. A lovely day out.",
			},
			{
				daysAgo: 99,
				course: "Navan",
				country: "IRE",
				race: "Maiden Stakes",
				raceType: "Flat",
				furlongs: 8,
				going: "Good",
				className: "Maiden",
				position: 1,
				field: 13,
				jockey: "Seán Fogarty",
				comment: "Broke well, travelled sweetly and won with a bit in hand.",
			},
			{
				daysAgo: 140,
				course: "Fairyhouse",
				country: "IRE",
				race: "Juvenile Maiden",
				raceType: "Flat",
				furlongs: 7,
				going: "Yielding",
				className: "Maiden",
				position: 5,
				field: 11,
				beatenLengths: 5,
				jockey: "Conor Hanratty",
				comment: "Debut, shaped with promise.",
			},
		],
		upcoming: {
			inHours: 40,
			course: "Naas",
			country: "IRE",
			race: "Rionna Spring Cup Handicap",
			raceType: "Flat",
			furlongs: 8,
			going: "Good",
			className: "Class 3",
			status: "DECLARED",
			draw: 7,
			weightLbs: 128,
			jockey: "Seán Fogarty",
		},
		updates: [
			{
				key: "declared",
				type: "race",
				title: "Declared for Naas on Saturday",
				body: "Declared this morning for a mile handicap at Naas. Seán is booked. Ground is forecast good and he has worked the house down all week.",
				daysAgo: 0,
			},
			{
				key: "work-photo",
				type: "trainer",
				title: "Last bit of work before Saturday",
				body: "Seven furlongs with a stablemate this morning and he finished full of himself. Cormac says he has never seen him look better.",
				daysAgo: 2,
				imageUrl: IMAGES.raceBend,
			},
			{
				key: "vet",
				type: "wellbeing",
				title: "Vet check: all clear",
				body: "Pre-race check done. Legs cold and tight, wind clear. Training load is at full and he is thriving on it.",
				daysAgo: 2,
			},
			{
				key: "farrier",
				type: "general",
				title: "Fresh shoes on",
				body: "The farrier was in on Tuesday and put a fresh set of plates on for Saturday. Hooves in lovely order.",
				daysAgo: 4,
			},
			{
				key: "video-gallop",
				type: "trainer",
				title: "Watch him go",
				body: "Short clip of Tuesday's canter up the all-weather. Chestnut on the inside, the one with the blaze.",
				daysAgo: 6,
				videoUrl: VIDEO_URL,
			},
			{
				key: "curragh",
				type: "race",
				title: "A better run than it looks",
				body: "Fourth at the Curragh and beaten three and a quarter lengths, but he was stuck behind a wall of horses at the two-furlong pole. Seán thinks he'd have been in the first two.",
				daysAgo: 29,
			},
		],
	},
	{
		key: "misty-furrow",
		name: "Misty Furrow",
		sex: "MARE",
		colour: "Grey",
		foaledOn: "2020-05-18",
		foaledPlace: "Co. Tipperary",
		foaledCountry: "IRE",
		sire: "Silver Reeve",
		dam: "Cloonbeg Lady",
		damsire: "Old Tradition",
		status: "IN_TRAINING",
		bio: "A tough, honest grey mare who has won over hurdles and is now working back to a fitness level that will do her justice.",
		story: "Misty Furrow came to the yard as a bumper winner with a big engine and not a lot of manners. A winter of schooling later and she is a different mare: patient at her hurdles, brave at the last. She is entered for a mares' novice hurdle at Down Royal and the team is hoping the ground comes up soft.",
		trainerNotes: "Wants soft ground and two and a half miles. Jumps well.",
		ownershipBlurb: "Owned by the Rionna club.",
		photos: [
			{ url: IMAGES.greyMare, caption: "Misty Furrow on a soft morning" },
			{ url: IMAGES.stableWindow, caption: "Checking on the yard" },
		],
		sortOrder: 3,
		followedByTom: false,
		wellbeing: { vetCheck: "MONITORING", vetCheckedDaysAgo: 6, load: "LIGHT" },
		runs: [
			{
				daysAgo: 21,
				course: "Limerick",
				country: "IRE",
				race: "Mares Novice Hurdle",
				raceType: "Hurdle",
				furlongs: 20,
				going: "Soft",
				className: "Class 4",
				position: 3,
				field: 8,
				beatenLengths: 4,
				jockey: "Pádraig Meaney",
				comment: "Jumped well, outstayed late. Ground was riding on the sticky side.",
			},
			{
				daysAgo: 70,
				course: "Tipperary",
				country: "IRE",
				race: "Mares Maiden Hurdle",
				raceType: "Hurdle",
				furlongs: 16,
				going: "Soft",
				className: "Maiden",
				position: 1,
				field: 12,
				jockey: "Pádraig Meaney",
				comment: "Led at the second last and never looked in danger.",
			},
			{
				daysAgo: 108,
				course: "Punchestown",
				country: "IRE",
				race: "Mares Bumper",
				raceType: "NH Flat",
				furlongs: 16,
				going: "Yielding",
				className: "Class 4",
				position: 2,
				field: 15,
				beatenLengths: 1.5,
				jockey: "Pádraig Meaney",
				comment: "Stayed on well, would not mind a trip.",
			},
			{
				daysAgo: 160,
				course: "Gowran Park",
				country: "IRE",
				race: "Bumper",
				raceType: "NH Flat",
				furlongs: 16,
				going: "Good to Soft",
				className: "Maiden",
				position: 4,
				field: 14,
				beatenLengths: 6,
				jockey: "Conor Hanratty",
				comment: "Debut, learned plenty.",
			},
			{
				daysAgo: 210,
				course: "Cork",
				country: "IRE",
				race: "Mares Bumper",
				raceType: "NH Flat",
				furlongs: 16,
				going: "Soft",
				className: "Maiden",
				position: 7,
				field: 17,
				beatenLengths: 12,
				jockey: "Conor Hanratty",
				comment: "Very green, no disgrace.",
			},
		],
		upcoming: {
			inHours: 120,
			course: "Down Royal",
			country: "GB",
			race: "Mares Novice Hurdle",
			raceType: "Hurdle",
			furlongs: 20,
			going: "Soft",
			className: "Class 3",
			status: "ENTERED",
		},
		updates: [
			{
				key: "monitoring",
				type: "wellbeing",
				title: "Vet check: monitoring",
				body: "A little heat in the near fore after Limerick. Nothing to worry about, but the vet wants another look next week. We have eased her work back to light for now.",
				daysAgo: 6,
			},
			{
				key: "schooling-photo",
				type: "trainer",
				title: "Schooling this morning",
				body: "Over the little hurdles in the school: foot perfect, every one. She has found her feet this season.",
				daysAgo: 9,
				imageUrl: IMAGES.jockey,
			},
			{
				key: "entry",
				type: "race",
				title: "Entered at Down Royal",
				body: "Entered in a mares' novice hurdle next week. Fingers crossed for rain.",
				daysAgo: 3,
			},
			{
				key: "bath",
				type: "general",
				title: "Spa day",
				body: "A rare moment of glamour: a proper bath and a long pick-out. Don't let the grey fool you, she was brown again by lunchtime.",
				daysAgo: 15,
			},
		],
	},
	{
		key: "old-boreen",
		name: "Old Boreen",
		sex: "GELDING",
		colour: "Dark Bay",
		foaledOn: "2017-02-27",
		foaledPlace: "Co. Cork",
		foaledCountry: "IRE",
		sire: "Rathcoole",
		dam: "Narrow Road",
		damsire: "Carrigeen",
		status: "IN_TRAINING",
		bio: "The yard's elder statesman. A dark bay gelding who has won at four tracks and knows exactly what he is doing.",
		story: "Every yard needs one: the horse who leads the youngsters up the gallops, teaches the new arrivals manners, and still shows up on a Saturday to win a handicap chase. Old Boreen has done it all, and at nine he is not done. He will run at Galway again in the spring if the ground is right.",
		trainerNotes: "Likes a trip and a sound surface. Keep him fresh.",
		ownershipBlurb: "Owned by the Rionna club.",
		photos: [
			{ url: IMAGES.darkGelding, caption: "Old Boreen, still looking the part" },
			{ url: IMAGES.barn, caption: "His usual spot by the barn door" },
		],
		sortOrder: 4,
		followedByTom: true,
		wellbeing: { vetCheck: "ALL_CLEAR", vetCheckedDaysAgo: 10, load: "LIGHT" },
		runs: [
			{
				daysAgo: 55,
				course: "Galway",
				country: "IRE",
				race: "Plate Handicap Chase",
				raceType: "Chase",
				furlongs: 24,
				going: "Good to Firm",
				className: "Class 2",
				position: 5,
				field: 18,
				beatenLengths: 9,
				jockey: "Pádraig Meaney",
				comment: "Never nearer, but travelled well for a long way.",
			},
			{
				daysAgo: 120,
				course: "Fairyhouse",
				country: "IRE",
				race: "Veterans Handicap Chase",
				raceType: "Chase",
				furlongs: 24,
				going: "Soft",
				className: "Class 3",
				position: 1,
				field: 9,
				jockey: "Pádraig Meaney",
				comment: "Jumped like a three-year-old and won going away.",
			},
			{
				daysAgo: 190,
				course: "Punchestown",
				country: "IRE",
				race: "Handicap Chase",
				raceType: "Chase",
				furlongs: 20,
				going: "Heavy",
				className: "Class 3",
				position: 3,
				field: 12,
				beatenLengths: 7.5,
				jockey: "Pádraig Meaney",
				comment: "Plugged on in the mud.",
			},
		],
		updates: [
			{
				key: "winter-plan",
				type: "trainer",
				title: "Plans for the winter",
				body: "He is having an easy few weeks, with plenty of walking and a little pick-up work. Back in earnest after Christmas. The old man has earned it.",
				daysAgo: 5,
			},
			{
				key: "vet-clear",
				type: "wellbeing",
				title: "Vet check: all clear",
				body: "Annual MOT done. Teeth, heart and legs all as good as you could hope for a nine-year-old. Fit as a fiddle.",
				daysAgo: 10,
			},
			{
				key: "barn-photo",
				type: "general",
				title: "Lord of the manor",
				body: "Caught in his usual spot by the barn door at feeding time, waiting to be told he is a good boy.",
				daysAgo: 13,
				imageUrl: IMAGES.barn,
			},
			{
				key: "galway",
				type: "race",
				title: "A game run at Galway",
				body: "Fifth in a big field, and the first time he has been out since the spring. He came home sound and happy, and that is all we ask.",
				daysAgo: 55,
			},
		],
	},
	{
		key: "saltmarsh-dancer",
		name: "Saltmarsh Dancer",
		sex: "GELDING",
		colour: "Grey",
		foaledOn: "2021-04-09",
		foaledPlace: "Co. Wexford",
		foaledCountry: "IRE",
		sire: "Tidewater",
		dam: "Dancing Gull",
		damsire: "Seabreeze Prince",
		status: "IN_TRAINING",
		bio: "A big, rangy grey gelding who is learning his job over fences. All heart, occasionally all legs.",
		story: "Saltmarsh Dancer has been a project, and a rewarding one. He is a big horse who took his time to grow into himself, but this season he has finally put it together and won a novice hurdle at Limerick. He was due to run again this week but has been taken out with a slight setback; the team will give him the time he needs.",
		trainerNotes: "Big horse, needs time. Do not rush.",
		ownershipBlurb: "Owned by the Rionna club.",
		photos: [
			{ url: IMAGES.greyGelding, caption: "Saltmarsh Dancer in the early light" },
			{ url: IMAGES.stalls, caption: "Between the stalls" },
		],
		sortOrder: 5,
		followedByTom: false,
		wellbeing: { vetCheck: "TREATMENT", vetCheckedDaysAgo: 1, load: "RESTING" },
		runs: [
			{
				daysAgo: 33,
				course: "Limerick",
				country: "IRE",
				race: "Novice Hurdle",
				raceType: "Hurdle",
				furlongs: 16,
				going: "Good to Soft",
				className: "Class 4",
				position: 1,
				field: 10,
				jockey: "Conor Hanratty",
				comment: "Settled in behind, quickened up well on the run-in.",
			},
			{
				daysAgo: 82,
				course: "Wexford",
				country: "IRE",
				race: "Maiden Hurdle",
				raceType: "Hurdle",
				furlongs: 16,
				going: "Good",
				className: "Maiden",
				position: 2,
				field: 14,
				beatenLengths: 2,
				jockey: "Conor Hanratty",
				comment: "Gave away ground with a sloppy jump at the third.",
			},
			{
				daysAgo: 130,
				course: "Thurles",
				country: "IRE",
				race: "Bumper",
				raceType: "NH Flat",
				furlongs: 16,
				going: "Soft",
				className: "Maiden",
				position: 6,
				field: 16,
				beatenLengths: 11,
				jockey: "Conor Hanratty",
				comment: "Raw, would improve for the experience.",
			},
		],
		upcoming: {
			inHours: 30,
			course: "Punchestown",
			country: "IRE",
			race: "Beginners Chase",
			raceType: "Chase",
			furlongs: 20,
			going: "Yielding",
			className: "Class 3",
			status: "NON_RUNNER",
		},
		updates: [
			{
				key: "non-runner",
				type: "race",
				title: "Taken out of Punchestown",
				body: "We have taken Saltmarsh out of his race tomorrow. He was a little short behind on Monday, nothing sinister, but we are not going to take a chance with a horse we think so much of.",
				daysAgo: 0,
			},
			{
				key: "treatment",
				type: "wellbeing",
				title: "Vet check: treatment",
				body: "Minor muscle strain behind. Physio twice a week, anti-inflammatories for five days and controlled walking only. Expect him back in work in about three weeks.",
				daysAgo: 1,
			},
			{
				key: "limerick-win",
				type: "race",
				title: "Looking back at that Limerick win",
				body: "A gentle reminder of what he can do when everything goes right: a smooth novice hurdle win at Limerick last month.",
				daysAgo: 33,
			},
			{
				key: "box-rest",
				type: "general",
				title: "Making the most of box rest",
				body: "He is taking it in his stride and has already made friends with the horse next door. A few extra carrots never hurt.",
				daysAgo: 3,
				imageUrl: IMAGES.stalls,
			},
		],
	},
	{
		key: "corrib-whisper",
		name: "Corrib Whisper",
		sex: "MARE",
		colour: "Bay",
		foaledOn: "2022-05-21",
		foaledPlace: "Co. Galway",
		foaledCountry: "IRE",
		sire: "Lough Mask",
		dam: "Silent Pier",
		damsire: "Cashel Boy",
		status: "IN_TRAINING",
		bio: "A well-made bay mare from the west with a lovely temperament. Just arrived at the yard, with our founding members getting the first look.",
		story: "Corrib Whisper is the newest face in the yard and we are bringing her along quietly, with the founding members getting the first look. She has three runs behind her from her previous yard and is learning Cormac's routine, with a first run for the club pencilled in for the new year.",
		trainerNotes: "Early days. Quiet, willing, a pleasure to deal with.",
		ownershipBlurb: "Owned by the Rionna club. Founding members first.",
		photos: [{ url: IMAGES.bayMare, caption: "Corrib Whisper, settling in" }],
		sortOrder: 6,
		inviteOnly: true,
		followedByTom: true,
		wellbeing: { vetCheck: "ALL_CLEAR", vetCheckedDaysAgo: 8, load: "LIGHT" },
		runs: [
			{
				daysAgo: 60,
				course: "Galway",
				country: "IRE",
				race: "Maiden Fillies Stakes",
				raceType: "Flat",
				furlongs: 10,
				going: "Good",
				className: "Maiden",
				position: 4,
				field: 13,
				beatenLengths: 4.5,
				jockey: "Aoife Tierney",
				comment: "Ran green but kept on.",
			},
			{
				daysAgo: 100,
				course: "Roscommon",
				country: "IRE",
				race: "Juvenile Maiden",
				raceType: "Flat",
				furlongs: 8,
				going: "Yielding",
				className: "Maiden",
				position: 7,
				field: 12,
				beatenLengths: 9,
				jockey: "Aoife Tierney",
				comment: "Debut, was very green.",
			},
			{
				daysAgo: 25,
				course: "Listowel",
				country: "IRE",
				race: "Mares Handicap",
				raceType: "Flat",
				furlongs: 10,
				going: "Soft",
				className: "Class 5",
				position: 2,
				field: 9,
				beatenLengths: 1.25,
				jockey: "Conor Hanratty",
				comment: "Ran a lovely race and has more to give.",
			},
		],
		updates: [
			{
				key: "arrival",
				type: "trainer",
				title: "Welcome to the yard, Corrib Whisper",
				body: "She arrived on the lorry this morning, walked off like she owned the place and went straight to her box. Cormac says she is the calmest new arrival he has had in years.",
				daysAgo: 8,
				imageUrl: IMAGES.bayMare,
			},
			{
				key: "first-vet",
				type: "wellbeing",
				title: "Vet check: all clear",
				body: "Arrival check done. Clean bill of health and exactly the right weight.",
				daysAgo: 8,
			},
			{
				key: "diet",
				type: "trainer",
				title: "Settling in on her new diet",
				body: "Cormac has her on a gentle build-up of oats and hay while she gets used to the routine. Weight is steady and her coat is shining.",
				daysAgo: 5,
			},
			{
				key: "first-canter",
				type: "general",
				title: "First steps under saddle",
				body: "A few easy laps of the sand arena this morning. She took to it like she had been doing it all her life.",
				daysAgo: 2,
			},
		],
	},
];

// ---------------------------------------------------------------------------
// Events (Circle events space + ClubEventMeta)
// ---------------------------------------------------------------------------

export type EventTypeFixture = "RACE_DAY" | "STABLE_VISIT" | "SOCIAL" | "QA" | "OTHER";

export interface EventFixture {
	key: string;
	type: EventTypeFixture;
	name: string;
	description: string;
	/** Days from the seed time (negative = past). */
	inDays: number;
	/** Hour of day, Europe/Dublin wall clock (kept simple: UTC hour in autumn/winter). */
	hour: number;
	minutes: number;
	location: string;
	/** Persona keys that RSVP. */
	going: string[];
	tomGoing: boolean;
}

export const EVENTS: EventFixture[] = [
	{
		key: "live-qa",
		type: "QA",
		name: "Live Q&A with Cormac",
		description:
			"Thursday evening, kettle on, phone in hand. Cormac answers whatever you throw at him: gallops, entries, feeding, how a horse gets from the field to the winners' enclosure. Drop your questions in advance.",
		inDays: 3,
		hour: 20,
		minutes: 0,
		location: "Online (link on RSVP)",
		going: ["maeve", "donal", "siobhan", "niamh", "tadhg"],
		tomGoing: true,
	},
	{
		key: "gallops-morning",
		type: "STABLE_VISIT",
		name: "Morning on the gallops",
		description:
			"An early start and a hot flask. Watch the string work on the gallops, meet the lads and lasses who do the riding, and have a bacon roll with Cormac in the yard afterwards. Wellies recommended.",
		inDays: 8,
		hour: 7,
		minutes: 30,
		location: "Cormac Dunleavy's yard, Co. Kildare",
		going: ["maeve", "ciaran", "roisin", "eamon"],
		tomGoing: true,
	},
	{
		key: "leopardstown-day",
		type: "RACE_DAY",
		name: "Rionna Day at Leopardstown",
		description:
			"A members' day out at the races, with a few of ours running. We have a table in the stand, a bit of lunch, and a lot of rooting to do. Come as you are and wear something warm.",
		inDays: 12,
		hour: 12,
		minutes: 30,
		location: "Leopardstown Racecourse, Dublin",
		going: ["donal", "siobhan", "niamh", "eamon", "tadhg", "roisin"],
		tomGoing: true,
	},
	{
		key: "autumn-supper",
		type: "SOCIAL",
		name: "Members' Autumn Supper",
		description:
			"A long table, good food and nothing but racing talk. A relaxed evening to put faces to the names you have been chatting to in the community. Everyone welcome, plus-ones included.",
		inDays: 20,
		hour: 19,
		minutes: 30,
		location: "The Hunting Lodge, Co. Kildare",
		going: ["maeve", "donal", "ciaran"],
		tomGoing: false,
	},
	{
		key: "sales-preview",
		type: "OTHER",
		name: "Yearling sales preview evening",
		description:
			"A relaxed look at what the club could be looking at next season: a quick talk through the catalogue with Cormac and plenty of time for questions.",
		inDays: 30,
		hour: 18,
		minutes: 30,
		location: "Online (link on RSVP)",
		going: ["siobhan", "tadhg"],
		tomGoing: false,
	},
	{
		key: "galway-evening",
		type: "RACE_DAY",
		name: "Galway Festival Evening",
		description:
			"An evening at Ballybrit with the club. A great night and a lovely run from Old Boreen, who finished fifth against some serious opposition.",
		inDays: -45,
		hour: 17,
		minutes: 30,
		location: "Galway Racecourse",
		going: ["maeve", "donal", "siobhan", "ciaran", "niamh", "eamon", "roisin"],
		tomGoing: true,
	},
	{
		key: "foaling-visit",
		type: "STABLE_VISIT",
		name: "Meet the foals",
		description:
			"A summer morning at the stud meeting the new arrivals. Plenty of nuzzles, plenty of photos, and a rare chance to see where it all begins.",
		inDays: -20,
		hour: 11,
		minutes: 0,
		location: "Co. Meath",
		going: ["maeve", "roisin", "tadhg", "niamh"],
		tomGoing: true,
	},
	{
		key: "summer-social",
		type: "SOCIAL",
		name: "Summer Social on the Lawn",
		description:
			"A sunny afternoon, a barbecue and a table full of friends. The perfect way to meet your fellow members.",
		inDays: -33,
		hour: 14,
		minutes: 0,
		location: "Kildare",
		going: ["donal", "ciaran", "eamon", "siobhan"],
		tomGoing: false,
	},
];

// ---------------------------------------------------------------------------
// Community posts (Circle)
// ---------------------------------------------------------------------------

export type SpaceKey =
	| "racing"
	| "newToRacing"
	| "lifestyle"
	| "charityImpact"
	| "networking"
	| "stableNotes"
	| "announcements";

/** Existing Circle spaces (verified before any write). Announcements comes from org metadata when set. */
export const COMMUNITY_SPACES: Record<SpaceKey, { id: string; name: string }> = {
	racing: { id: "2896718", name: "Racing" },
	newToRacing: { id: "2695469", name: "New to Racing" },
	lifestyle: { id: "2896719", name: "Lifestyle" },
	charityImpact: { id: "2695471", name: "Charity Impact" },
	networking: { id: "2695473", name: "Networking" },
	stableNotes: { id: "2695465", name: "Stable Notes" },
	announcements: { id: "2695457", name: "Official Announcements" },
};

export type PostAuthor = "admin" | "trainer" | (string & {});

export interface PostFixture {
	key: string;
	/** A community space, or `horse:<horseKey>` for that horse's space. */
	space: SpaceKey | `horse:${string}`;
	/** "admin" = Rionna Admin, "trainer" = admin posting AS the trainer (PostAttribution), else a persona key. */
	author: PostAuthor;
	title: string;
	paragraphs: string[];
	imageUrl?: string;
	videoUrl?: string;
	/** [persona key, text] pairs. */
	comments?: [string, string][];
	/** Persona keys that like the post. */
	likedBy?: string[];
}

const LONG_THREAD_COMMENTS: [string, string][] = [
	[
		"maeve",
		"Great question. For me it is always the going first, then the jockey, then whatever I have a feeling about.",
	],
	["donal", "Going first, always. I used to ignore it and I paid for it."],
	[
		"siobhan",
		"I am only new to this but I love that the trainers talk about the ground so much. It makes sense now.",
	],
	[
		"ciaran",
		"Don't forget the draw on the flat, it matters more than people think at the smaller tracks.",
	],
	["niamh", "And whether the horse likes the track! Some of them just don't."],
	[
		"eamon",
		"I always look at how they came home last time. If they finished full of running, I am interested.",
	],
	["roisin", "That is such a good tip, Eamon. I never thought about it that way."],
	[
		"tadhg",
		"Cormac said something similar on the last Q&A: 'watch how they pull up, not just how they finish'.",
	],
	["maeve", "Yes! He did say that. The pull-up tells you everything."],
	[
		"donal",
		"Class drops are the other one. A horse running below its level is worth a second look.",
	],
	[
		"siobhan",
		"What does 'class drop' actually mean in practice? Sorry if that is a silly question.",
	],
	[
		"ciaran",
		"Not silly at all. It means the horse is running in a lower grade of race than it has recently. Usually easier opposition.",
	],
	[
		"niamh",
		"Ciarán has it. A horse that was running in a Class 2 dropping to a Class 4 is often one to watch.",
	],
	["eamon", "Often, but not always. Sometimes there is a reason they dropped."],
	["roisin", "Like a niggle?"],
	["eamon", "A niggle, or a trainer who just wants a confidence-booster."],
	[
		"tadhg",
		"The yard here is brilliant for being open about that stuff. You get the story, not just the form.",
	],
	[
		"maeve",
		"That is the whole point of the club for me. I would much rather know why than guess.",
	],
	["donal", "Agreed. Hawthorn Ridge's last update was a perfect example."],
	[
		"siobhan",
		"I read that one twice. 'Finishing like a train' is my favourite phrase of the season.",
	],
	["ciaran", "Going to put that on a mug."],
	["niamh", "Make me one too."],
	[
		"eamon",
		"To go back to the original question, I think the answer is: be curious and ask questions. This thread proves it.",
	],
	["roisin", "Couldn't agree more. A year ago I did not know what a handicap was."],
	["tadhg", "A year ago I thought the draw was a lottery."],
	["maeve", "Technically it is, Tadhg."],
	["donal", "Ha!"],
	["siobhan", "Okay that one I got."],
	["ciaran", "Welcome to the club, Siobhán."],
	["niamh", "Best community on the internet. Back to the gallops on Saturday!"],
];

export const POSTS: PostFixture[] = [
	// --- Announcements (one, in Official Announcements) ---
	{
		key: "announce-welcome",
		space: "announcements",
		author: "admin",
		title: "Autumn at Rionna: what is coming up",
		paragraphs: [
			"Welcome to the new season, everyone. A quick roundup of what is on the horizon.",
			"Kilcullen Boy is declared for Naas on Saturday. Corrib Whisper has arrived at the yard and the founding members have first sight of her. And we have a Live Q&A with Cormac on Thursday evening, so bring your questions.",
			"Thank you for being part of this. It is a real pleasure to share the journey with you.",
		],
		imageUrl: IMAGES.greenFields,
		likedBy: ["maeve", "donal", "siobhan", "ciaran", "niamh", "eamon"],
		comments: [
			["maeve", "Looking forward to all of it. Thank you for the update!"],
			["tadhg", "Naas on Saturday, I will be glued to the app."],
		],
	},

	// --- Racing ---
	{
		key: "racing-naas-preview",
		space: "racing",
		author: "donal",
		title: "Kilcullen Boy at Naas: who else is excited?",
		paragraphs: [
			"Declared this morning, a mile handicap, ground forecast good. I think he has a real chance.",
			"Anyone else going to be there on Saturday? I will be at the rail by the winning post if you fancy a chat.",
		],
		comments: [
			["maeve", "Will be watching from the sofa but with a lot of noise."],
			["ciaran", "Draw seven is a decent one over that trip."],
			["eamon", "Seán Fogarty rides him well. Positive."],
		],
		likedBy: ["maeve", "siobhan", "ciaran", "niamh"],
	},
	{
		key: "racing-form-thread",
		space: "racing",
		author: "maeve",
		title: "How do you read form? Let us have it.",
		paragraphs: [
			"I have been trying to get better at reading a racecard and everyone seems to do it differently. What do you look at first?",
			"Going? Jockey? Trainer's form? Tell me your tricks.",
		],
		comments: LONG_THREAD_COMMENTS,
		likedBy: ["donal", "siobhan", "ciaran", "niamh", "eamon", "roisin", "tadhg"],
	},
	{
		key: "racing-hawthorn-recap",
		space: "racing",
		author: "niamh",
		title: "Hawthorn Ridge was brilliant at Naas",
		paragraphs: [
			"Second by three-quarters of a length in a big field. She flew at the finish.",
			"I am so proud of that filly. Roll on the next one.",
		],
		imageUrl: IMAGES.raceFinish,
		comments: [
			["maeve", "She looked incredible. Aoife gave her a lovely ride."],
			["roisin", "Another furlong and she wins."],
		],
		likedBy: ["maeve", "donal", "ciaran", "eamon"],
	},
	{
		key: "racing-going-explained",
		space: "racing",
		author: "ciaran",
		title: "Why does the going matter so much?",
		paragraphs: [
			"Something I have been wondering. Does soft ground really make that big a difference?",
			"The trainers talk about it so much.",
		],
		comments: [
			[
				"donal",
				"A huge difference. Some horses just float over firm ground and others need cut.",
			],
			["siobhan", "That makes sense. Misty Furrow always seems to want rain."],
		],
		likedBy: ["siobhan"],
	},
	{
		key: "racing-winter-plans",
		space: "racing",
		author: "eamon",
		title: "Winter jumping: what are we all looking forward to?",
		paragraphs: [
			"Flat season is winding down and the jumpers are warming up. Who is excited for the winter?",
		],
		comments: [
			["roisin", "Misty Furrow at Down Royal!"],
			["tadhg", "And Old Boreen if the ground allows."],
		],
		likedBy: ["roisin", "tadhg", "donal"],
	},
	{
		key: "racing-photo-finish",
		space: "racing",
		author: "tadhg",
		title: "Photo from last summer's Galway night",
		paragraphs: ["Found this on my phone. What an evening it was."],
		imageUrl: IMAGES.racePack,
		likedBy: ["maeve", "ciaran", "niamh"],
	},

	// --- New to Racing ---
	{
		key: "new-first-race",
		space: "newToRacing",
		author: "siobhan",
		title: "My first time at the races. Any tips?",
		paragraphs: [
			"I am going to Leopardstown with the club and I have never been to a racecourse in my life. What should I know?",
			"Should I bet? Should I not? What do I wear?",
		],
		comments: [
			["maeve", "Wear comfortable shoes and a warm coat. That is 90% of it."],
			["donal", "No pressure on the betting. Many of us just go for the horses."],
			["niamh", "Get a racecard and follow our horses. It is a lovely way to learn."],
			["ciaran", "Come and find us in the stand. We will look after you."],
		],
		likedBy: ["maeve", "donal", "niamh", "ciaran", "eamon"],
	},
	{
		key: "new-racecard",
		space: "newToRacing",
		author: "roisin",
		title: "What do all the numbers on a racecard mean?",
		paragraphs: [
			"I opened one last weekend and I was totally lost. There are numbers everywhere!",
		],
		comments: [
			[
				"eamon",
				"The Inside Track has a lovely piece on it. 'How to read a racecard'. Start there.",
			],
			["roisin", "Perfect, thank you Eamon!"],
		],
		likedBy: ["eamon"],
	},
	{
		key: "new-declared",
		space: "newToRacing",
		author: "tadhg",
		title: "What does 'declared' mean?",
		paragraphs: ["I keep seeing it in the app. Is it the same as entered?"],
		comments: [
			[
				"maeve",
				"Declared means the horse is definitely running. Entered just means they might.",
			],
			["tadhg", "That is clear as day. Thank you."],
		],
		likedBy: ["maeve"],
	},
	{
		key: "new-why-joined",
		space: "newToRacing",
		author: "niamh",
		title: "Why did you join the club?",
		paragraphs: ["Honest answers only. I came for the horses and stayed for the people."],
		comments: [
			[
				"donal",
				"For me it was the stories. You can follow a horse from field to winners' enclosure.",
			],
			["maeve", "I wanted to feel part of something. And this is lovely."],
			["siobhan", "I love that nobody makes you feel silly for asking."],
		],
		likedBy: ["donal", "maeve", "siobhan", "roisin"],
	},

	// --- Lifestyle ---
	{
		key: "life-hotel",
		space: "lifestyle",
		author: "maeve",
		title: "A weekend away worth the drive",
		paragraphs: [
			"Just back from the hotel in the Paddock offers and it was gorgeous. A lovely room, great breakfast, and they could not have been friendlier when we said we were Rionna members.",
			"Highly recommend if you fancy a night away.",
		],
		imageUrl: IMAGES.hotelRoom,
		comments: [
			["donal", "Booking it for the Autumn Supper weekend."],
			["roisin", "That room looks unreal."],
		],
		likedBy: ["donal", "roisin", "niamh", "siobhan"],
	},
	{
		key: "life-dinner",
		space: "lifestyle",
		author: "donal",
		title: "Dinner before the races",
		paragraphs: [
			"Anyone have a favourite place to eat near Leopardstown? I would like to book somewhere before the club day.",
		],
		imageUrl: IMAGES.dinner,
		comments: [
			["siobhan", "There is a great spot in Stillorgan. I will send you the name."],
			["ciaran", "The Paddock offers have a good restaurant discount, worth a look."],
		],
		likedBy: ["siobhan", "ciaran"],
	},
	{
		key: "life-racing-style",
		space: "lifestyle",
		author: "roisin",
		title: "What are we wearing to the races?",
		paragraphs: [
			"Wardrobe crisis. It is October and I want to look the part without freezing. Ideas?",
		],
		comments: [
			["niamh", "Wool coat, good boots. You can never go wrong."],
			["maeve", "A hat if you can pull it off. I cannot, but you probably can."],
		],
		likedBy: ["niamh", "maeve"],
	},
	{
		key: "life-sunday-walk",
		space: "lifestyle",
		author: "eamon",
		title: "Sunday walk with a view",
		paragraphs: [
			"Out on the hills this morning and the light was perfect. Not a horse in sight, but it felt like racing country.",
		],
		imageUrl: IMAGES.hills,
		likedBy: ["tadhg", "siobhan", "maeve"],
	},

	// --- Charity Impact ---
	{
		key: "charity-update",
		space: "charityImpact",
		author: "admin",
		title: "Our charity total: thank you",
		paragraphs: [
			"Thanks to all of you, this season's charity has passed the halfway mark of its goal.",
			"Five percent of every membership goes straight to the cause, and you can see the running total on the Paddock tab.",
		],
		imageUrl: IMAGES.stoneHouse,
		comments: [
			["maeve", "Delighted to be part of this."],
			["donal", "Brilliant work, everyone."],
		],
		likedBy: ["maeve", "donal", "siobhan", "ciaran", "niamh", "eamon", "roisin", "tadhg"],
	},
	{
		key: "charity-vote",
		space: "charityImpact",
		author: "niamh",
		title: "Do not forget to vote for next season's charity",
		paragraphs: ["There is a poll running. It takes ten seconds. It makes a real difference."],
		comments: [
			["roisin", "Voted!"],
			["tadhg", "Done."],
		],
		likedBy: ["roisin", "tadhg"],
	},
	{
		key: "charity-visit",
		space: "charityImpact",
		author: "ciaran",
		title: "A visit to the charity's new building",
		paragraphs: [
			"I got to visit the building our donations are helping to restore. It is a real project and the people there are wonderful. Pictures coming soon.",
		],
		likedBy: ["maeve", "niamh"],
	},

	// --- Networking ---
	{
		key: "net-intro",
		space: "networking",
		author: "tadhg",
		title: "Introduce yourself!",
		paragraphs: [
			"New here? Tell us who you are, where you are from and what your favourite horse is. I will go first: Tadhg, Cork, and I am a sucker for a grey.",
		],
		comments: [
			["siobhan", "Siobhán, Dublin. I like a bay with a white sock. Hawthorn, you know why."],
			["roisin", "Róisín, Limerick. A good chestnut for me."],
			["ciaran", "Ciarán, Galway. I just like the ones who try hard."],
		],
		likedBy: ["siobhan", "roisin", "ciaran", "maeve"],
	},
	{
		key: "net-meetup",
		space: "networking",
		author: "maeve",
		title: "Anyone going to the Autumn Supper?",
		paragraphs: ["Keen to put some faces to names. Who is in?"],
		comments: [
			["donal", "In!"],
			["ciaran", "Count me in."],
			["eamon", "Wouldn't miss it."],
		],
		likedBy: ["donal", "ciaran", "eamon"],
	},
	{
		key: "net-business",
		space: "networking",
		author: "eamon",
		title: "Looking for a recommendation: a good equine physio",
		paragraphs: [
			"Not for a club horse, for my own mare at home. Anyone know a good one in Leinster?",
		],
		comments: [["niamh", "I can introduce you to ours. DM me."]],
		likedBy: ["niamh"],
	},

	// --- Stable Notes (trainer posts "as" Cormac) ---
	{
		key: "stable-weekly",
		space: "stableNotes",
		author: "trainer",
		title: "Week in the yard",
		paragraphs: [
			"Good week. Kilcullen Boy is flying and Hawthorn Ridge keeps improving. Misty Furrow is on the easy list for a few days after a slight heat in her leg, but the vet is happy.",
			"Old Boreen is enjoying his holiday. We have had a bit of frost in the mornings so the lads are in thick coats, and the horses are into their winter routine.",
		],
		imageUrl: IMAGES.stalls,
		comments: [
			["maeve", "Thanks, Cormac. Love these updates."],
			["donal", "Keep them coming!"],
		],
		likedBy: ["maeve", "donal", "siobhan", "ciaran", "niamh"],
	},
	{
		key: "stable-qa-answer",
		space: "stableNotes",
		author: "trainer",
		title: "Your questions from last week",
		paragraphs: [
			"A few good ones came in. 'How long does it take to get a horse race-fit?' Usually six to eight weeks from a break, depending on the horse. 'What do they eat?' A lot of oats, hay, and the occasional carrot.",
			"More answers on Thursday's Live Q&A.",
		],
		comments: [["roisin", "The carrot answer made me smile."]],
		likedBy: ["roisin", "tadhg"],
	},
	{
		key: "stable-morning",
		space: "stableNotes",
		author: "trainer",
		title: "Morning light on the gallops",
		paragraphs: ["Up at five, out by six. The best part of the day."],
		imageUrl: IMAGES.raceStart,
		likedBy: ["maeve", "eamon", "niamh", "siobhan"],
	},
	{
		key: "stable-video",
		space: "stableNotes",
		author: "trainer",
		title: "A quick clip from this morning",
		paragraphs: ["The string on their way up for first lot."],
		videoUrl: VIDEO_URL,
		likedBy: ["donal", "ciaran"],
	},

	// --- Horse spaces ---
	{
		key: "h-hawthorn-welcome",
		space: "horse:hawthorn-ridge",
		author: "siobhan",
		title: "Go on, Hawthorn!",
		paragraphs: ["That second at Naas has me hooked. Who else is following her?"],
		comments: [
			["niamh", "Me! She is my favourite."],
			["maeve", "Every run is better than the last."],
		],
		likedBy: ["niamh", "maeve"],
	},
	{
		key: "h-kilcullen-ahead",
		space: "horse:kilcullen-boy",
		author: "trainer",
		title: "Kilcullen Boy: declared and ready",
		paragraphs: [
			"He is in great form. The ground should suit and Seán is happy with the draw. We will have him spot on for Saturday.",
		],
		imageUrl: IMAGES.raceClose,
		comments: [
			["donal", "Cannot wait!"],
			["ciaran", "Great news."],
		],
		likedBy: ["donal", "ciaran", "maeve", "eamon"],
	},
	{
		key: "h-misty-hurdles",
		space: "horse:misty-furrow",
		author: "ciaran",
		title: "Misty Furrow over hurdles",
		paragraphs: ["Watched the replay from Limerick again. She really does jump well."],
		comments: [["roisin", "A proper jumper."]],
		likedBy: ["roisin"],
	},
	{
		key: "h-boreen-legend",
		space: "horse:old-boreen",
		author: "eamon",
		title: "Old Boreen: the people's horse",
		paragraphs: [
			"Nine years old and still going. If you do not love this horse, I do not know what to say.",
		],
		comments: [
			["tadhg", "He is a legend."],
			["maeve", "Happy retirement whenever he fancies it."],
		],
		likedBy: ["tadhg", "maeve", "donal"],
	},
	{
		key: "h-saltmarsh-wishes",
		space: "horse:saltmarsh-dancer",
		author: "roisin",
		title: "Get well soon, Saltmarsh",
		paragraphs: ["Sending all the good wishes for a speedy recovery. Take your time, big man."],
		comments: [["niamh", "Rest up."]],
		likedBy: ["niamh", "donal"],
	},
];

// ---------------------------------------------------------------------------
// Inside Track (educational, one pinned "Start Here" block + videos)
// ---------------------------------------------------------------------------

export interface InsideTrackFixture {
	key: string;
	title: string;
	paragraphs: string[];
	pinned?: boolean;
	imageUrl?: string;
	videoUrl?: string;
}

export const INSIDE_TRACK: InsideTrackFixture[] = [
	{
		key: "it-start",
		pinned: true,
		title: "Start here: welcome to the Inside Track",
		paragraphs: [
			"This is your home for everything educational at Rionna: short explainers, videos and guides that make racing make sense.",
			"Start with the pinned pieces, then check back every week for something new.",
		],
		imageUrl: IMAGES.greenFields,
	},
	{
		key: "it-racecard",
		pinned: true,
		title: "How to read a racecard",
		paragraphs: [
			"A racecard packs a lot into a small space: the horse's number, its recent form, the weight it carries, the trainer and jockey.",
			"Form figures read left to right with the most recent run last, so '3212' means the horse finished second last time out. F is a fall, P is pulled up, U is unseated.",
			"Next time one of our horses is declared, open the racecard and see how much of it you can decode.",
		],
	},
	{
		key: "it-declared",
		pinned: true,
		title: "What does 'declared' actually mean?",
		paragraphs: [
			"Entering and declaring are two different steps. An entry says a horse might run; trainers enter several races to keep their options open.",
			"A declaration is the commitment, made 24 to 48 hours before the race: the horse is running, and it gets a number and a jockey.",
		],
	},
	{
		key: "it-going",
		title: "Going explained: from firm to heavy",
		paragraphs: [
			"The 'going' describes the ground: firm, good to firm, good, good to soft, soft and heavy. It is measured with a GoingStick and reported before each meeting.",
			"Some horses love fast ground, others need cut in it. Trainers often wait for the right going before they declare.",
		],
	},
	{
		key: "it-video-day",
		title: "A day in the life at the yard (video)",
		paragraphs: ["Follow a morning in the yard from first lot to feeding time."],
		videoUrl: VIDEO_URL,
		imageUrl: IMAGES.tackRoom,
	},
	{
		key: "it-video-trainer",
		title: "Cormac explains: how a horse gets race-fit (video)",
		paragraphs: [
			"Six weeks, a lot of canters and some very good hay. Cormac talks us through it.",
		],
		videoUrl: VIDEO_URL,
	},
];

// ---------------------------------------------------------------------------
// Polls, Paddock, Charity, News
// ---------------------------------------------------------------------------

export interface PollFixture {
	key: string;
	question: string;
	status: "open" | "closed";
	options: { key: string; label: string }[];
	/** Votes by persona key -> option key. */
	votes: Record<string, string>;
	/** Tom's vote (option key), if any. */
	tomVote?: string;
	/** Days since publication. */
	publishedDaysAgo: number;
	closesInDays?: number;
	closedDaysAgo?: number;
	/** Charity vote: linked from the CharityConfig. */
	charity?: boolean;
}

export const POLLS: PollFixture[] = [
	{
		key: "spring-target",
		question: "Which race should we target for Hawthorn Ridge in the spring?",
		status: "open",
		publishedDaysAgo: 2,
		closesInDays: 10,
		options: [
			{ key: "oaks-trial", label: "A mile-and-a-quarter fillies' trial" },
			{ key: "handicap", label: "A big-field handicap" },
			{ key: "listed", label: "Step up to a Listed race" },
		],
		votes: {
			maeve: "oaks-trial",
			donal: "handicap",
			siobhan: "oaks-trial",
			niamh: "oaks-trial",
			roisin: "listed",
		},
	},
	{
		key: "yearling-name",
		question: "What should we call our new yearling?",
		status: "open",
		publishedDaysAgo: 5,
		closesInDays: 7,
		options: [
			{ key: "shamrock", label: "Shamrock Lane" },
			{ key: "river", label: "River Tolka" },
			{ key: "hawthorn-two", label: "Hawthorn Gate" },
			{ key: "bog", label: "Bog Oak" },
		],
		votes: { donal: "river", ciaran: "bog", eamon: "river", tadhg: "shamrock" },
		tomVote: "river",
	},
	{
		key: "summer-day",
		question: "Where should we hold next summer's members' day?",
		status: "closed",
		publishedDaysAgo: 40,
		closedDaysAgo: 12,
		options: [
			{ key: "curragh", label: "The Curragh" },
			{ key: "galway", label: "Galway" },
			{ key: "yard", label: "At the yard" },
		],
		votes: {
			maeve: "yard",
			donal: "galway",
			siobhan: "yard",
			ciaran: "yard",
			niamh: "curragh",
			eamon: "galway",
			roisin: "yard",
			tadhg: "yard",
		},
		tomVote: "yard",
	},
	{
		key: "charity-vote",
		question: "Which cause should we support next season?",
		status: "open",
		publishedDaysAgo: 3,
		closesInDays: 14,
		charity: true,
		options: [
			{ key: "hospice", label: "A local children's hospice" },
			{ key: "retrained", label: "Retraining racehorses for new careers" },
			{ key: "stable-lads", label: "Support for stable staff" },
		],
		votes: {
			maeve: "retrained",
			donal: "retrained",
			siobhan: "hospice",
			ciaran: "retrained",
			niamh: "stable-lads",
			eamon: "hospice",
		},
	},
];

export interface OfferFixture {
	key: string;
	title: string;
	partnerName: string;
	category: "restaurant" | "hotel" | "lifestyle" | "racing" | "other";
	description: string;
	imageUrl: string;
	discountCode?: string;
	redeemUrl?: string;
	howToRedeem?: string;
	validForDays?: number;
}

export const OFFERS: OfferFixture[] = [
	{
		key: "lodge-dinner",
		title: "10% off dinner for two",
		partnerName: "The Hunting Lodge",
		category: "restaurant",
		description:
			"A warm welcome, an open fire and a menu built around Irish produce. Members get 10% off the evening menu, Tuesday to Thursday.",
		imageUrl: IMAGES.dinner,
		discountCode: "RIONNA10",
		howToRedeem: "Show this screen to your server when you ask for the bill.",
		validForDays: 180,
	},
	{
		key: "bistro-lunch",
		title: "Free coffee with Sunday lunch",
		partnerName: "Mill Street Bistro",
		category: "restaurant",
		description:
			"A relaxed Sunday lunch spot with proper roast dinners. A free coffee on us when you show your membership.",
		imageUrl: IMAGES.restaurant,
		howToRedeem: "Show this screen at the till.",
	},
	{
		key: "country-house",
		title: "Two nights for the price of one",
		partnerName: "Ardnagashel House",
		category: "hotel",
		description:
			"A country house hotel with a roaring fire and a view over the fields. Book two nights midweek and the second is on the house.",
		imageUrl: IMAGES.hotelRoom,
		discountCode: "RIONNA2FOR1",
		redeemUrl: "https://example.com/rionna-members",
		validForDays: 120,
	},
	{
		key: "town-boutique",
		title: "15% off a weekend stay",
		partnerName: "The Larchfield",
		category: "hotel",
		description:
			"A beautifully restored townhouse hotel with a cracking breakfast. 15% off weekend stays for members.",
		imageUrl: IMAGES.hotelBed,
		discountCode: "RIONNA15",
		redeemUrl: "https://example.com/rionna-members",
	},
	{
		key: "tweed-shop",
		title: "20% off country clothing",
		partnerName: "Saddler & Sons",
		category: "lifestyle",
		description:
			"Waxed jackets, wool caps and boots that will see you through a winter on the gallops. 20% off for members.",
		imageUrl: IMAGES.tackRoom,
		discountCode: "RIONNA20",
		redeemUrl: "https://example.com/rionna-members",
	},
	{
		key: "race-tickets",
		title: "Two-for-one at Naas Racecourse",
		partnerName: "Naas Racecourse",
		category: "racing",
		description: "Bring a friend to the races. Two-for-one admission on selected fixtures.",
		imageUrl: IMAGES.raceBend,
		redeemUrl: "https://example.com/rionna-members",
		howToRedeem: "Quote your membership at the gate.",
	},
	{
		key: "gallops-experience",
		title: "Morning on the gallops experience",
		partnerName: "Dunleavy Racing",
		category: "racing",
		description:
			"Watch the string work with a trainer's commentary, then breakfast in the yard. Members get priority booking.",
		imageUrl: IMAGES.gallop,
		redeemUrl: "https://example.com/rionna-members",
	},
	{
		key: "book-shop",
		title: "10% off at the bookshop",
		partnerName: "The Reading Room",
		category: "other",
		description:
			"A lovely independent bookshop with a brilliant sporting section. 10% off for members.",
		imageUrl: IMAGES.stoneHouse,
		discountCode: "RIONNA10B",
	},
];

export const CHARITY = {
	charityName: "Racing Hearts Ireland",
	description:
		"Racing Hearts Ireland is a fictional cause for this showcase: it stands in for the real charity the club will support. Five percent of every membership goes directly to it, and members vote on where the money goes each season.",
	logoUrl: IMAGES.stoneHouse,
	websiteUrl: "https://example.com/racing-hearts",
	percentage: 5,
	goalCents: 1_000_000,
	manualOverrideCents: 486_000,
	startedDaysAgo: 1,
	currency: "EUR",
} as const;

export interface NewsFixture {
	key: string;
	slug: string;
	title: string;
	subtitle: string;
	category: string;
	imageUrl: string;
	paragraphs: string[];
	publishedDaysAgo: number;
}

export const NEWS: NewsFixture[] = [
	{
		key: "news-naas",
		slug: "showcase-hawthorn-ridge-naas",
		title: "Hawthorn Ridge runs a cracker at Naas",
		subtitle: "Second by three-quarters of a length in a competitive handicap",
		category: "Race report",
		imageUrl: IMAGES.raceFinish,
		paragraphs: [
			"Hawthorn Ridge was only just held at Naas, finishing strongly late in a big field.",
			"Cormac says she is improving all the time and the team will look at a mile and a quarter next.",
		],
		publishedDaysAgo: 12,
	},
	{
		key: "news-corrib",
		slug: "showcase-corrib-whisper-arrives",
		title: "Corrib Whisper joins the yard",
		subtitle: "A calm and willing new arrival from the west",
		category: "Stable news",
		imageUrl: IMAGES.bayMare,
		paragraphs: [
			"A bay mare from Galway has arrived at the yard, with the founding members getting the first look.",
			"She is in early pre-training and a first run is pencilled in for the new year.",
		],
		publishedDaysAgo: 8,
	},
	{
		key: "news-charity",
		slug: "showcase-charity-halfway",
		title: "Our charity total passes the halfway mark",
		subtitle: "Thank you from all of us",
		category: "Charity",
		imageUrl: IMAGES.stoneHouse,
		paragraphs: [
			"Together we have raised almost half of this season's target. Five percent of every membership goes to the cause.",
			"Do not forget to vote for next season's charity in the Paddock.",
		],
		publishedDaysAgo: 20,
	},
];
