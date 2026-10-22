/* Built-in table talk, so every AI player has a voice even without Muse.
   Lines never mention the cards in hand. {opp} = a rival's name, {mate} = partner's name. */
(function (root) {
  "use strict";

  const LINES = {
    Arya: {
      start: ["Good luck, everyone. Let's keep it clean.", "Centre first, corners later. Shall we?"],
      four: ["Four in a line. Your move, {opp}.", "That line needs one more. Just saying."],
      sequence: ["Sequence. Exactly as planned.", "One down. Patience wins these."],
      block: ["Not that line, {opp}.", "I saw that one coming three moves ago."],
      remove: ["Sorry {opp}, that chip had to go.", "Removing the keystone."],
      wild: ["Wild card, well spent.", "Some moves are worth a jack."],
      hit: ["Fair play. I'll rebuild.", "Hmm. Noted, {opp}."],
      theirSeq: ["Well played. We still need just one move at a time.", "Okay {mate}, time to get serious."],
      idle: ["Thinking two lines ahead.", "Quiet board. I like quiet boards.", "{mate}, watch the diagonals."],
      win: ["Good game, all. Calm heads win.", "Well played, {mate}."],
      lose: ["Good game. Rematch?", "You earned that one, {opp}."]
    },
    Kabir: {
      start: ["Let's go! Nobody blinks first.", "I hope you like long lines, because I do."],
      four: ["Four! Come on, stop me if you can.", "Look at that line, {opp}. Scared yet?"],
      sequence: ["BOOM. Sequence!", "That's how you do it!"],
      block: ["Nope. Not today, {opp}.", "Blocked! Try another road."],
      remove: ["Your chip? Gone.", "Bulldozer coming through!"],
      wild: ["Wild jack, wild move!", "Rules are for other people. Jack goes here."],
      hit: ["Hey! I was using that!", "Okay {opp}, now it's personal."],
      theirSeq: ["Lucky. Enjoy it while it lasts.", "Fine. Now I go all in."],
      idle: ["Risky? Maybe. Fun? Definitely.", "Attack is the best defence.", "{mate}, I'm going for the long one."],
      win: ["Champions! Told you, {mate}!", "Too fast, too furious."],
      lose: ["Rematch. Right now.", "Okay, that was close. Next game is mine."]
    },
    Meera: {
      start: ["Picture abhi baaki hai, my friends!", "Chalo, let's make this filmy."],
      four: ["Four in a row! Thoda suspense, thoda drama.", "Interval ke baad climax, {opp}."],
      sequence: ["Sequence! Kya scene hai!", "Ek line, full paisa vasool."],
      block: ["Arre {opp}, itni jaldi kya hai?", "Not on my watch, hero."],
      remove: ["Sorry {opp}, kahani mein twist!", "Yeh chip toh gaya!"],
      wild: ["Jack ki entry, seeti bajao!", "Special appearance by the jack."],
      hit: ["Uff, {opp}! Dil toot gaya.", "Itna bhi kya gussa?"],
      theirSeq: ["Haar ke jeetne wale ko baazigar kehte hain.", "{mate}, ab asli khel shuru."],
      idle: ["Thinking... dramatic pause.", "Don't worry {mate}, I've got a plan.", "Popcorn ready, everyone?"],
      win: ["Happy ending! Well played, {mate}!", "Hum jeet gaye! All is well."],
      lose: ["Kal ho na ho, rematch toh hoga.", "Good game {opp}. Picture abhi baaki hai."]
    },
    Dev: {
      start: ["Wicket to wicket, nothing loose.", "Defence first. Runs will come."],
      four: ["Four! Straight down the ground.", "That's a boundary, {opp}."],
      sequence: ["Sequence! That's a six over long-on!", "Century up! Raise the bat."],
      block: ["Howzat! Line blocked.", "Clean bowled, {opp}. That line's out."],
      remove: ["Run out! Back to the pavilion.", "Stumped. That chip is gone."],
      wild: ["Wild jack: the yorker nobody saw.", "Bringing on the surprise bowler."],
      hit: ["Ouch. Dropped catch on our side.", "Review that, umpire!"],
      theirSeq: ["They've got one. We bat deep, {mate}.", "Good shot. Field's still set."],
      idle: ["Tight field, no gaps.", "Building the innings slowly.", "{mate}, I'll cover the corners."],
      win: ["Match won! What a partnership, {mate}.", "Trophy's ours. Good game, all."],
      lose: ["Well bowled, {opp}. We'll be back.", "Lost the toss, lost the match."]
    }
  };

  // How likely each event is to get a line (wins, losses and sequences always do)
  const CHANCE = { start: 1, four: 0.6, sequence: 1, block: 0.55, remove: 0.7, wild: 0.4, hit: 0.5, theirSeq: 0.8, idle: 0.12, win: 1, lose: 1 };

  function line(name, event, ctx, rand) {
    rand = rand || Math.random;
    let set = (LINES[name] || LINES.Arya)[event];
    if (set && !ctx.mate) set = set.filter((t) => !t.includes("{mate}")); // 1v1: nobody to talk to
    if (!set || !set.length || rand() > (CHANCE[event] || 0)) return "";
    const text = set[Math.floor(rand() * set.length)];
    return text.replace(/\{opp\}/g, ctx.opp || "friend").replace(/\{mate\}/g, ctx.mate || "partner");
  }

  root.SeqLines = { LINES, line };
})(typeof window !== "undefined" ? window : globalThis);
