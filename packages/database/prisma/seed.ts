import {db} from "./client";
import type {OrganizationMetadata} from "../types/organization-metadata";

// Placeholder horse photos — picsum.photos gives stable images by ID,
// good enough for UI prototyping without needing Supabase Storage uploads.
function photo(id: number, caption: string)
{
    return { url : `https://picsum.photos/seed/horse${id}/800/600`, caption };
}

const now     = new Date();
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) =>
  new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

async function main()
{
    console.log("🌱 Seeding database...");

    // ──────────────────────────────────────────────
    // 1. Organisation
    // ──────────────────────────────────────────────
    const org = await db.organization.upsert({
        where : { slug : "rionna" },
        update : {},
        create : {
            name : "Rionna",
            slug : "rionna",
            createdAt : new Date(),
            metadata : JSON.stringify({
                brand : { primaryColor : "#374B6C" },
                racing : { provider : "mock" },
                circle : {
                    communityDomain : "rionna.circle.so",
                    poll : {
                        enabled : false,
                        cadenceMinutes : 5,
                        enabledCategories : [
                            "trainer_post",
                            "horse_discussion",
                            "direct_engagement",
                            "dm"
                        ],
                    },
                },
                billing : {
                    stripeProductId : "prod_test",
                    stripePriceId : "price_test",
                },
                contact : {
                    aboutText : "Ireland's premier racing club for women",
                    contactEmail : "hello@rionna.com",
                },
            } satisfies OrganizationMetadata),
        },
    });
    console.log(`  ✓ Organisation: ${org.name} (${org.id})`);

    // ──────────────────────────────────────────────
    // 2. Trainers
    // ──────────────────────────────────────────────
    const [aidan, willie] = await Promise.all([
        db.trainer.upsert({
            where : {
                organizationId_providerEntityId :
                  { organizationId : org.id, providerEntityId : "tf-trainer-1" }
            },
            update : {},
            create : {
                organizationId : org.id,
                providerEntityId : "tf-trainer-1",
                name : "Aidan O'Brien",
            },
        }),
        db.trainer.upsert({
            where : {
                organizationId_providerEntityId :
                  { organizationId : org.id, providerEntityId : "tf-trainer-2" }
            },
            update : {},
            create : {
                organizationId : org.id,
                providerEntityId : "tf-trainer-2",
                name : "Willie Mullins",
            },
        }),
    ]);
    console.log(`  ✓ Trainers: ${aidan.name}, ${willie.name}`);

    // ──────────────────────────────────────────────
    // 3. Jockeys
    // ──────────────────────────────────────────────
    const [paul, ryan] = await Promise.all([
        db.jockey.upsert({
            where : {
                organizationId_providerEntityId :
                  { organizationId : org.id, providerEntityId : "tf-jockey-1" }
            },
            update : {},
            create : {
                organizationId : org.id,
                providerEntityId : "tf-jockey-1",
                name : "Paul Townend",
            },
        }),
        db.jockey.upsert({
            where : {
                organizationId_providerEntityId :
                  { organizationId : org.id, providerEntityId : "tf-jockey-2" }
            },
            update : {},
            create : {
                organizationId : org.id,
                providerEntityId : "tf-jockey-2",
                name : "Ryan Moore",
            },
        }),
    ]);
    console.log(`  ✓ Jockeys: ${paul.name}, ${ryan.name}`);

    // ──────────────────────────────────────────────
    // 4. Courses
    // ──────────────────────────────────────────────
    const [leopardstown, cheltenham, fairyhouse, punchestown] =
      await Promise.all([
          db.course.upsert({
              where : {
                  organizationId_providerEntityId : {
                      organizationId : org.id,
                      providerEntityId : "tf-course-leo"
                  }
              },
              update : {},
              create : {
                  organizationId : org.id,
                  providerEntityId : "tf-course-leo",
                  name : "Leopardstown",
                  country : "IE",
                  surface : "Turf"
              },
          }),
          db.course.upsert({
              where : {
                  organizationId_providerEntityId : {
                      organizationId : org.id,
                      providerEntityId : "tf-course-chelt"
                  }
              },
              update : {},
              create : {
                  organizationId : org.id,
                  providerEntityId : "tf-course-chelt",
                  name : "Cheltenham",
                  country : "GB",
                  surface : "Turf"
              },
          }),
          db.course.upsert({
              where : {
                  organizationId_providerEntityId : {
                      organizationId : org.id,
                      providerEntityId : "tf-course-fairy"
                  }
              },
              update : {},
              create : {
                  organizationId : org.id,
                  providerEntityId : "tf-course-fairy",
                  name : "Fairyhouse",
                  country : "IE",
                  surface : "Turf"
              },
          }),
          db.course.upsert({
              where : {
                  organizationId_providerEntityId : {
                      organizationId : org.id,
                      providerEntityId : "tf-course-punch"
                  }
              },
              update : {},
              create : {
                  organizationId : org.id,
                  providerEntityId : "tf-course-punch",
                  name : "Punchestown",
                  country : "IE",
                  surface : "Turf"
              },
          }),
      ]);
    console.log(
      `  ✓ Courses: Leopardstown, Cheltenham, Fairyhouse, Punchestown`);

    // ──────────────────────────────────────────────
    // 5. Meetings + Races (past results + one upcoming)
    // ──────────────────────────────────────────────

    // Past meeting 1 — Leopardstown 30 days ago
    const meetingLeo30 = await db.meeting.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-meeting-leo-30"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-meeting-leo-30",
            courseId : leopardstown.id,
            date : daysAgo(30)
        },
    });
    const raceLeo30    = await db.race.upsert({
        where : {
            organizationId_providerEntityId :
              { organizationId : org.id, providerEntityId : "tf-race-leo-30-1" }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-race-leo-30-1",
            meetingId : meetingLeo30.id,
            postTime : new Date(daysAgo(30).setHours(14, 30, 0, 0)),
            name : "Leopardstown Mares Novice Hurdle",
            raceType : "Hurdle",
            distanceFurlongs : 20,
            className : "Grade 2",
            prizeMoney : 35000,
            goingDescription : "Soft",
        },
    });

    // Past meeting 2 — Cheltenham 14 days ago
    const meetingChelt14 = await db.meeting.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-meeting-chelt-14"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-meeting-chelt-14",
            courseId : cheltenham.id,
            date : daysAgo(14)
        },
    });
    const raceChelt14    = await db.race.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-race-chelt-14-1"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-race-chelt-14-1",
            meetingId : meetingChelt14.id,
            postTime : new Date(daysAgo(14).setHours(15, 20, 0, 0)),
            name : "Mares' Novices' Hurdle (Grade 2)",
            raceType : "Hurdle",
            distanceFurlongs : 21,
            className : "Grade 2",
            prizeMoney : 75000,
            goingDescription : "Good to Soft",
        },
    });

    // Past meeting 3 — Fairyhouse 7 days ago
    const meetingFairy7 = await db.meeting.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-meeting-fairy-7"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-meeting-fairy-7",
            courseId : fairyhouse.id,
            date : daysAgo(7)
        },
    });
    const raceFairy7    = await db.race.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-race-fairy-7-1"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-race-fairy-7-1",
            meetingId : meetingFairy7.id,
            postTime : new Date(daysAgo(7).setHours(13, 45, 0, 0)),
            name : "Irish Stallion Farms EBF Mares Hurdle",
            raceType : "Hurdle",
            distanceFurlongs : 18,
            className : "Listed",
            prizeMoney : 20000,
            goingDescription : "Yielding",
        },
    });

    // Past meeting 4 — Leopardstown 45 days ago
    const meetingLeo45 = await db.meeting.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-meeting-leo-45"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-meeting-leo-45",
            courseId : leopardstown.id,
            date : daysAgo(45)
        },
    });
    const raceLeo45    = await db.race.upsert({
        where : {
            organizationId_providerEntityId :
              { organizationId : org.id, providerEntityId : "tf-race-leo-45-1" }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-race-leo-45-1",
            meetingId : meetingLeo45.id,
            postTime : new Date(daysAgo(45).setHours(16, 0, 0, 0)),
            name : "Christmas Hurdle",
            raceType : "Hurdle",
            distanceFurlongs : 16,
            className : "Grade 1",
            prizeMoney : 85000,
            goingDescription : "Soft to Heavy",
        },
    });

    // Upcoming meeting — Punchestown in 3 days (for DECLARED entry)
    const meetingPunch3 = await db.meeting.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-meeting-punch-3"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-meeting-punch-3",
            courseId : punchestown.id,
            date : daysFromNow(3)
        },
    });
    const racePunch3    = await db.race.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-race-punch-3-1"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-race-punch-3-1",
            meetingId : meetingPunch3.id,
            postTime : new Date(daysFromNow(3).setHours(14, 45, 0, 0)),
            name : "Punchestown Champion Hurdle",
            raceType : "Hurdle",
            distanceFurlongs : 16,
            className : "Grade 1",
            prizeMoney : 120000,
            goingDescription : "Good",
        },
    });

    console.log(`  ✓ Meetings + Races created`);

    // ──────────────────────────────────────────────
    // 6. Horses
    // ──────────────────────────────────────────────

    // Horse 1 — Starlight Rose (IN_TRAINING, declared for Punchestown)
    const starlightRose = await db.horse.upsert({
        where : {
            organizationId_slug :
              { organizationId : org.id, slug : "starlight-rose" }
        },
        update : {},
        create : {
            organizationId : org.id,
            slug : "starlight-rose",
            name : "Starlight Rose",
            status : "IN_TRAINING",
            trainerId : willie.id,
            sortOrder : 1,
            publishedAt : daysAgo(60),
            bio :
              "Starlight Rose is the jewel of the Rionna string — an elegant grey mare with an electric turn of foot that belies her gentle nature. She arrived as a shy two-year-old but quickly showed an extraordinary will to win at morning exercise, catching Willie Mullins' eye on her very first school over hurdles.",
            trainerNotes :
              "Thrives on soft ground. Needs a positive ride — she settles beautifully behind horses then produces a devastating finish. Best watched over 2 miles.",
            pedigree : {
                sire : "Galileo",
                dam : "Rose of Tralee",
                damSire : "Danehill Dancer"
            },
            ownershipBlurb :
              "Jointly owned by the Rionna membership. Each member holds an equal share in this remarkable mare.",
            photos : [
                photo(1, "Starlight Rose in the parade ring at Leopardstown"),
                photo(2, "Morning gallop at Ballydoyle, January 2026"),
                photo(11, "Post-race winner's enclosure, Cheltenham"),
            ],
        },
    });

    // Horse 2 — Crimson Flair (IN_TRAINING, 2 past runs — 1st and 3rd)
    const crimsonFlair = await db.horse.upsert({
        where : {
            organizationId_slug :
              { organizationId : org.id, slug : "crimson-flair" }
        },
        update : {},
        create : {
            organizationId : org.id,
            slug : "crimson-flair",
            name : "Crimson Flair",
            status : "IN_TRAINING",
            trainerId : aidan.id,
            sortOrder : 2,
            publishedAt : daysAgo(55),
            bio :
              "Crimson Flair is a bay mare who has taken the jump racing world by storm in her first season under rules. Trained by Aidan O'Brien — making a rare foray into the NH sphere — she combines a pedigree built for the flat with a jumping ability that has left seasoned observers open-mouthed.",
            trainerNotes :
              "Exceptionally versatile. Handles any ground but blossoms on good-to-soft. A quick learner — she schooled over fences in December and looked a natural.",
            pedigree : {
                sire : "Frankel",
                dam : "Red Crimson",
                damSire : "High Chaparral"
            },
            photos : [
                photo(
                  3,
                  "Crimson Flair at Cheltenham for the Mares' Novices' Hurdle"),
                photo(4, "Schooling session at Coolmore, March 2026"),
            ],
        },
    });

    // Horse 3 — Emerald Storm (IN_TRAINING, 1 past run — 2nd)
    const emeraldStorm = await db.horse.upsert({
        where : {
            organizationId_slug :
              { organizationId : org.id, slug : "emerald-storm" }
        },
        update : {},
        create : {
            organizationId : org.id,
            slug : "emerald-storm",
            name : "Emerald Storm",
            status : "IN_TRAINING",
            trainerId : willie.id,
            sortOrder : 3,
            publishedAt : daysAgo(50),
            bio :
              "Emerald Storm is a dark-coated Irish mare with a tempestuous attitude to match her name. She took time to settle in training but Willie Mullins has always maintained she was something special — and her debut run at Fairyhouse proved him right, unlucky not to win on debut when hampered two out.",
            pedigree :
              { sire : "Yeats", dam : "Stormy Emerald", damSire : "Stowaway" },
            photos : [
                photo(5, "Emerald Storm on debut at Fairyhouse"),
                photo(6, "Stable yard portrait, Willie Mullins Racing"),
            ],
        },
    });

    // Horse 4 — Velvet Thunder (REHAB)
    const velvetThunder = await db.horse.upsert({
        where : {
            organizationId_slug :
              { organizationId : org.id, slug : "velvet-thunder" }
        },
        update : {},
        create : {
            organizationId : org.id,
            slug : "velvet-thunder",
            name : "Velvet Thunder",
            status : "REHAB",
            trainerId : aidan.id,
            sortOrder : 4,
            publishedAt : daysAgo(45),
            bio :
              "Velvet Thunder is currently on a planned rehabilitation break after a minor muscle strain sustained after her promising debut run. She is doing brilliantly at the farm and is expected back in full training by early summer. Her work before her injury suggested she has a serious engine — the team can't wait to have her back.",
            pedigree : {
                sire : "Sea The Stars",
                dam : "Velvet Night",
                damSire : "Montjeu"
            },
            photos : [
                photo(7, "Velvet Thunder at Curragh racecourse"),
                photo(8, "Rehabilitation walk at the farm, April 2026"),
            ],
        },
    });

    // Horse 5 — Golden Reign (PRE_TRAINING)
    const goldenReign = await db.horse.upsert({
        where : {
            organizationId_slug :
              { organizationId : org.id, slug : "golden-reign" }
        },
        update : {},
        create : {
            organizationId : org.id,
            slug : "golden-reign",
            name : "Golden Reign",
            status : "PRE_TRAINING",
            sortOrder : 5,
            publishedAt : daysAgo(30),
            bio :
              "Golden Reign is our exciting new addition — a striking chestnut filly who has just arrived at Willie Mullins' yard from the sales. She has an outstanding pedigree and the physique to match. The plan is to give her the time she needs to mature before introducing her to racecourse life later in the year.",
            pedigree : {
                sire : "Kingman",
                dam : "Golden Silence",
                damSire : "Sadler's Wells"
            },
            photos : [
                photo(9, "Golden Reign arriving at Willie Mullins Racing"),
            ],
        },
    });

    console.log(`  ✓ Horses: ${
        [starlightRose, crimsonFlair, emeraldStorm, velvetThunder, goldenReign]
          .map(h => h.name)
          .join(", ")}`);

    // ──────────────────────────────────────────────
    // 7. Race Entries
    // ──────────────────────────────────────────────

    // Starlight Rose — past win at Leopardstown 30 days ago
    const entryStarlightLeo30 = await db.raceEntry.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-entry-starlight-leo30"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-entry-starlight-leo30",
            horseId : starlightRose.id,
            raceId : raceLeo30.id,
            status : "RAN",
            draw : 3,
            weightLbs : 154,
            jockeyId : paul.id,
            trainerId : willie.id,
            finishingPosition : 1,
            beatenLengths : 0,
            timeformComment :
              "Travelled supremely well throughout and produced a devastating burst of speed in the straight. Beat her rivals with something in hand — could hardly have been more impressive.",
            ratingAchieved : 142,
            starRating : 5,
            notifiedStates : [ "RAN" ],
        },
    });

    // Starlight Rose — past run at Cheltenham 14 days ago (3rd)
    const entryStarlightChelt = await db.raceEntry.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-entry-starlight-chelt"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-entry-starlight-chelt",
            horseId : starlightRose.id,
            raceId : raceChelt14.id,
            status : "RAN",
            draw : 6,
            weightLbs : 154,
            jockeyId : paul.id,
            trainerId : willie.id,
            finishingPosition : 3,
            beatenLengths : 2.5,
            timeformComment :
              "Ran another solid race on faster ground than ideal. Couldn't quite sustain her challenge from the last but ran with great credit in a strong Grade 2 field. Soft ground is clearly her optimum.",
            ratingAchieved : 138,
            starRating : 4,
            notifiedStates : [ "RAN" ],
        },
    });

    // Starlight Rose — DECLARED for Punchestown in 3 days (next entry)
    const entryStarlightPunch = await db.raceEntry.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-entry-starlight-punch"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-entry-starlight-punch",
            horseId : starlightRose.id,
            raceId : racePunch3.id,
            status : "DECLARED",
            draw : 2,
            weightLbs : 154,
            jockeyId : paul.id,
            trainerId : willie.id,
            notifiedStates : [ "DECLARED" ],
        },
    });

    // Crimson Flair — win at Fairyhouse 7 days ago
    const entryCrimsonFairy = await db.raceEntry.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-entry-crimson-fairy"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-entry-crimson-fairy",
            horseId : crimsonFlair.id,
            raceId : raceFairy7.id,
            status : "RAN",
            draw : 1,
            weightLbs : 158,
            jockeyId : ryan.id,
            trainerId : aidan.id,
            finishingPosition : 1,
            beatenLengths : 0,
            timeformComment :
              "Made all and jumped brilliantly throughout. Never seriously threatened once she hit the front after the second last. A hugely impressive Listed winner who is clearly on the upgrade.",
            ratingAchieved : 140,
            starRating : 5,
            notifiedStates : [ "RAN" ],
        },
    });

    // Crimson Flair — previous run Leopardstown 45 days ago (2nd)
    const entryCrimsonLeo45 = await db.raceEntry.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-entry-crimson-leo45"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-entry-crimson-leo45",
            horseId : crimsonFlair.id,
            raceId : raceLeo45.id,
            status : "RAN",
            draw : 4,
            weightLbs : 160,
            jockeyId : ryan.id,
            trainerId : aidan.id,
            finishingPosition : 2,
            beatenLengths : 1.5,
            timeformComment :
              "Ran an excellent debut race over hurdles. Got outpaced briefly at the top of the straight but rallied strongly to claim second. Clearly learned a great deal from the experience.",
            ratingAchieved : 135,
            starRating : 4,
            notifiedStates : [ "RAN" ],
        },
    });

    // Emerald Storm — debut run Fairyhouse 7 days ago (2nd)
    const entryEmeraldFairy = await db.raceEntry.upsert({
        where : {
            organizationId_providerEntityId : {
                organizationId : org.id,
                providerEntityId : "tf-entry-emerald-fairy"
            }
        },
        update : {},
        create : {
            organizationId : org.id,
            providerEntityId : "tf-entry-emerald-fairy",
            horseId : emeraldStorm.id,
            raceId : raceFairy7.id,
            status : "RAN",
            draw : 5,
            weightLbs : 152,
            jockeyId : paul.id,
            trainerId : willie.id,
            finishingPosition : 2,
            beatenLengths : 0.75,
            timeformComment :
              "Very unlucky not to win on debut — hampered approaching the second last when travelling strongly and looking the likely winner. Rallied gamely to the line. A performance full of promise.",
            ratingAchieved : 130,
            starRating : 5,
            notifiedStates : [ "RAN" ],
        },
    });

    console.log(`  ✓ Race entries created`);

    // ──────────────────────────────────────────────
    // 8. News Posts
    // ──────────────────────────────────────────────

    const newsPosts = [
        {
            slug : "starlight-rose-wins-leopardstown",
            title : "Starlight Rose Shines at Leopardstown",
            subtitle :
              "A stunning display from our star mare in the Mares Novice Hurdle",
            featuredImageUrl : "https://picsum.photos/seed/news1/1200/630",
            publishedAt : daysAgo(30),
            contentHtml :
              `<p>Starlight Rose produced a performance of breathtaking quality at Leopardstown yesterday, winning the Grade 2 Mares Novice Hurdle in a manner that left connections buzzing with excitement.</p><p>Ridden with supreme confidence by Paul Townend, she travelled beautifully throughout the two-mile trip and unleashed a devastating burst of speed in the straight that her rivals simply couldn't live with.</p><p>Trainer Willie Mullins was quick to highlight the performance: "She's a very special mare. The way she picked up when asked was electric — that's a Grade 1 horse in the making."</p><p>The Rionna membership were out in force to cheer her home, and the celebrations in the winner's enclosure were memorable. This is exactly why we do this — moments like these are what the club is all about.</p>`,
            contentJson : {
                type : "doc",
                content : [ {
                    type : "paragraph",
                    content : [ {
                        type : "text",
                        text :
                          "Starlight Rose produced a performance of breathtaking quality at Leopardstown."
                    } ]
                } ]
            },
        },
        {
            slug : "cheltenham-report-march-2026",
            title : "Cheltenham Report: Starlight Rose Runs with Credit",
            subtitle :
              "Third place in the Mares' Novices' Hurdle — the future is bright",
            featuredImageUrl : "https://picsum.photos/seed/news2/1200/630",
            publishedAt : daysAgo(13),
            contentHtml :
              `<p>Starlight Rose ran another excellent race at the Cheltenham Festival, finishing third in the Grade 2 Mares' Novices' Hurdle on ground that was slightly faster than ideal for her.</p><p>The race was run at a searching gallop and she was unable to quite reproduce her Leopardstown brilliance on the faster surface, but she stuck to her task gamely and was beaten only two and a half lengths.</p><p>Paul Townend reported afterwards: "She ran a lovely race. The ground just wasn't in her favour today — on soft or heavy ground, she's a different animal. Leopardstown in the spring is on the radar."</p><p>Willie Mullins confirmed that Punchestown will be the next target, where softer ground is expected. The team are excited about what lies ahead for this remarkable mare.</p>`,
            contentJson : {
                type : "doc",
                content : [ {
                    type : "paragraph",
                    content : [ {
                        type : "text",
                        text :
                          "Starlight Rose ran another excellent race at the Cheltenham Festival."
                    } ]
                } ]
            },
        },
        {
            slug : "crimson-flair-fairyhouse-win",
            title : "Crimson Flair Makes It Two Wins from Two",
            subtitle : "A brilliant front-running display at Fairyhouse",
            featuredImageUrl : "https://picsum.photos/seed/news3/1200/630",
            publishedAt : daysAgo(6),
            contentHtml :
              `<p>Crimson Flair continued her rapid rise through the ranks with an imperious front-running victory in the Listed Irish Stallion Farms EBF Mares Hurdle at Fairyhouse on Sunday.</p><p>Sent straight to the front by Ryan Moore, she dictated every inch of the race and jumped brilliantly throughout. Once she hit the front after the second last, the race was over as a contest.</p><p>Aidan O'Brien, making a rare appearance on the National Hunt scene, was delighted: "She's a joy to train. Very professional, very straightforward. Ryan gave her a masterclass of front-running and she did the rest herself."</p><p>After just two runs over hurdles, Crimson Flair already looks a horse of considerable ability. The team are keen to step her up to Grade level next — a big prize beckons.</p>`,
            contentJson : {
                type : "doc",
                content : [ {
                    type : "paragraph",
                    content : [ {
                        type : "text",
                        text :
                          "Crimson Flair continued her rapid rise with a brilliant win at Fairyhouse."
                    } ]
                } ]
            },
        },
        {
            slug : "punchestown-preview-starlight-rose",
            title : "Punchestown Preview: Starlight Rose Declared",
            subtitle :
              "Our star mare heads to Punchestown for the Champion Hurdle in three days",
            featuredImageUrl : "https://picsum.photos/seed/news4/1200/630",
            publishedAt : daysAgo(1),
            contentHtml :
              `<p>The excitement is building in the Rionna camp as Starlight Rose has been confirmed as a runner in the Grade 1 Punchestown Champion Hurdle, which takes place in three days' time.</p><p>Conditions look ideal — the going is forecast as good to yielding, which suits her profile perfectly. Paul Townend keeps the ride and has been in excellent form throughout the spring season.</p><p>Willie Mullins spoke to us this morning from the yard: "She's in great shape. We're very happy with how she's come out of Cheltenham. She's been working brilliantly all week and is ready to run her best race. The ground suits, the trip suits — we have every reason to be optimistic."</p><p>Members are encouraged to come racing if they can make it to Punchestown. Club colours will be on full display and there will be a members' gathering in the parade ring before the race. Full details will be sent by email shortly.</p>`,
            contentJson : {
                type : "doc",
                content : [ {
                    type : "paragraph",
                    content : [ {
                        type : "text",
                        text :
                          "Starlight Rose has been declared for the Punchestown Champion Hurdle."
                    } ]
                } ]
            },
        },
    ];

    for (const post of newsPosts)
    {
        await db.newsPost.upsert({
            where : {
                organizationId_slug :
                  { organizationId : org.id, slug : post.slug }
            },
            update : {},
            create : {
                organizationId : org.id,
                ...post,
            },
        });
    }
    console.log(`  ✓ News posts: ${newsPosts.length} articles`);

    // ──────────────────────────────────────────────
    // 10. Update Horse latestEntryId / nextEntryId
    // ──────────────────────────────────────────────

    await Promise.all([
        db.horse.update({
            where : { id : starlightRose.id },
            data : {
                publishedAt : daysAgo(60),
                latestEntryId : entryStarlightChelt.id,
                nextEntryId : entryStarlightPunch.id,
                trainerId : willie.id,
                bio :
                  "Starlight Rose is the jewel of the Rionna string — an elegant grey mare with an electric turn of foot that belies her gentle nature. She arrived as a shy two-year-old but quickly showed an extraordinary will to win at morning exercise, catching Willie Mullins' eye on her very first school over hurdles.",
                trainerNotes :
                  "Thrives on soft ground. Needs a positive ride — she settles beautifully behind horses then produces a devastating finish. Best watched over 2 miles.",
                pedigree : {
                    sire : "Galileo",
                    dam : "Rose of Tralee",
                    damSire : "Danehill Dancer"
                },
                ownershipBlurb :
                  "Jointly owned by the Rionna membership. Each member holds an equal share in this remarkable mare.",
                photos : [
                    photo(1,
                          "Starlight Rose in the parade ring at Leopardstown"),
                    photo(2, "Morning gallop at Ballydoyle, January 2026"),
                    photo(11, "Post-race winner's enclosure, Cheltenham"),
                ],
            },
        }),
        db.horse.update({
            where : { id : crimsonFlair.id },
            data : {
                publishedAt : daysAgo(55),
                latestEntryId : entryCrimsonFairy.id,
                trainerId : aidan.id,
                bio :
                  "Crimson Flair is a bay mare who has taken the jump racing world by storm in her first season under rules. Trained by Aidan O'Brien — making a rare foray into the NH sphere — she combines a pedigree built for the flat with a jumping ability that has left seasoned observers open-mouthed.",
                trainerNotes :
                  "Exceptionally versatile. Handles any ground but blossoms on good-to-soft. A quick learner — she schooled over fences in December and looked a natural.",
                pedigree : {
                    sire : "Frankel",
                    dam : "Red Crimson",
                    damSire : "High Chaparral"
                },
                photos : [
                    photo(
                      3,
                      "Crimson Flair at Cheltenham for the Mares' Novices' Hurdle"),
                    photo(4, "Schooling session at Coolmore, March 2026"),
                ],
            },
        }),
        db.horse.update({
            where : { id : emeraldStorm.id },
            data : {
                publishedAt : daysAgo(50),
                latestEntryId : entryEmeraldFairy.id,
                trainerId : willie.id,
                bio :
                  "Emerald Storm is a dark-coated Irish mare with a tempestuous attitude to match her name. She took time to settle in training but Willie Mullins has always maintained she was something special — and her debut run at Fairyhouse proved him right, unlucky not to win on debut when hampered two out.",
                pedigree : {
                    sire : "Yeats",
                    dam : "Stormy Emerald",
                    damSire : "Stowaway"
                },
                photos : [
                    photo(5, "Emerald Storm on debut at Fairyhouse"),
                    photo(6, "Stable yard portrait, Willie Mullins Racing"),
                ],
            },
        }),
        db.horse.update({
            where : { id : velvetThunder.id },
            data : {
                publishedAt : daysAgo(45),
                trainerId : aidan.id,
                bio :
                  "Velvet Thunder is currently on a planned rehabilitation break after a minor muscle strain sustained after her promising debut run. She is doing brilliantly at the farm and is expected back in full training by early summer. Her work before her injury suggested she has a serious engine — the team can't wait to have her back.",
                pedigree : {
                    sire : "Sea The Stars",
                    dam : "Velvet Night",
                    damSire : "Montjeu"
                },
                photos : [
                    photo(7, "Velvet Thunder at Curragh racecourse"),
                    photo(8, "Rehabilitation walk at the farm, April 2026"),
                ],
            },
        }),
        db.horse.update({
            where : { id : goldenReign.id },
            data : {
                publishedAt : daysAgo(30),
                bio :
                  "Golden Reign is our exciting new addition — a striking chestnut filly who has just arrived at Willie Mullins' yard from the sales. She has an outstanding pedigree and the physique to match. The plan is to give her the time she needs to mature before introducing her to racecourse life later in the year.",
                pedigree : {
                    sire : "Kingman",
                    dam : "Golden Silence",
                    damSire : "Sadler's Wells"
                },
                photos : [
                    photo(9, "Golden Reign arriving at Willie Mullins Racing"),
                ],
            },
        }),
    ]);

    console.log(
      `  ✓ Horse latestEntryId / nextEntryId linked, all 5 published`);
    console.log("\n🌱 Seed complete.");
    console.log("\nSummary:");
    console.log(
      "  • 5 horses published (Starlight Rose, Crimson Flair, Emerald Storm, Velvet Thunder, Golden Reign)");
    console.log(
      "  • Starlight Rose: 2 past results + DECLARED for Punchestown in 3 days");
    console.log("  • Crimson Flair: 2 past results (win + 2nd)");
    console.log("  • Emerald Storm: 1 past result (unlucky 2nd on debut)");
    console.log(
      "  • Velvet Thunder + Golden Reign: profiles only (REHAB / PRE_TRAINING)");
    console.log(
      "  • 4 news posts (Leopardstown win, Cheltenham report, Fairyhouse win, Punchestown preview)");
}

main()
  .catch((e) => {
      console.error("Seed failed:", e);
      process.exit(1);
  })
  .finally(async () => { await db.$disconnect(); });
