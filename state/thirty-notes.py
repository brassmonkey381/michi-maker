"""Writes state/thirty-notes.json: the page descriptions for the live binder, by page id."""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
live = json.load(open(os.path.join(here, 'thirty-live.json'), encoding='utf8'))
notes = [
    "The binder opens on the mouse. Five of the thirty Pikachu Rares, one illustrator each, beside the artwork the anniversary was built around. Thirty years of the same Pokemon and no two drawings alike.",
    "A title page of pure artwork: the 30th Celebration as a picture rather than a card. Every card of ME: 30th Celebration and its Classic Collection is in this binder once, one idea to each open spread.",
    "Nine more Pikachu Rares, one illustrator each. Same ears, same cheeks, nine different hands, read left to right like a contact sheet.",
    "The Eevee family as one picture, the page before the cards. Eevee's whole character is that it could become something else, and the set leans on that.",
    "Sylveon, Espeon and Umbreon, each as an ex beside its plain print, with an Eevee closing every row. The Sylveon ex Special Illustration Rare leads the page.",
    "Five of the seven Special Illustration Rares over their Double Rare prints: Fuecoco, Greninja and both Pikachu ex. Below them, the fancy prints of earlier eras: a Mega, a Shining, a VMAX. The rare card has always been the pretty one.",
    "Jirachi ex twice, the plain print and the Special Illustration Rare, in a sky of artwork. The set's quiet centrepiece, given the room it was drawn for.",
    "Mewtwo three ways down the left edge: the plain print, the ex, and the Futuristic Rare, beside a wall of Mewtwo art. The same Pokemon at three prices, and the difference is the picture.",
    "Mew answers Mewtwo from the right edge: plain print, ex, Futuristic Rare. The pair the first generation was built around, facing each other across the spine.",
    "Articuno, Zapdos and Moltres as Illustration Rares over their plain prints, in the order the first generation gave them. Beneath, one sky for all three.",
    "Everything else in these sets that flies. Lugia twice, twenty years apart, Ho-Oh beside them, then Vivillon, Tropius and Minior, with Volbeat and Illumise lighting the bottom row.",
    "Box legendaries in pairs, two to a row: Kyogre and Groudon, Dialga and Palkia with the Classic Palkia LV.X, Xerneas and Yveltal with Arceus VSTAR closing the row.",
    "Zacian with its Classic V print and Zamazenta, Solgaleo with its GX and Lunala, and Darkrai and Cresselia as the LEGEND pair, the most literal pair the game ever printed, with Cresselia's own card beside them.",
    "Morpeko, Drifloon and Chandelure as Illustration Rares over their plain prints, all lit from within. Murkrow and two Gengar prints, a modern ex and the Classic Prime, hold the dark below.",
    "Toxtricity in every print the set has, two plain and one Illustration Rare, with Toxel starting the line, on a stage of neon artwork.",
    "Kanto, Alola and Galar Meowth as Illustration Rares over their plain prints, with Delcatty and Sneasel from the Classic Collection. Three regions, one cat.",
    "The mouse meets the cat. Both Pikachu ex Double Rares and the Base Set Pikachu reprint, with artwork of the two of them face to face.",
    "Scraggy, Maushold and Hisuian Zorua drawn tiny in a big world, Illustration Rare above plain print. The set's illustrators are at their best when the Pokemon is small and the world around it is not.",
    "The same trick reversed: Alolan Exeggutor, Snorlax, Kangaskhan and Lycanroc, the ones that fill a frame, with Illustration Rares for the tree and the wolf.",
    "Two dragon lines start to finish, Deino to Hydreigon and Jangmo-o to Kommo-o, with the Classic Rayquaza EX and artwork of the sky it lives in.",
    "The dragon legends: Koraidon and Miraidon, Reshiram and Zekrom with the Classic Pikachu and Zekrom GX, and Salamence ex twice, Double Rare and Special Illustration Rare.",
    "Gimmighoul to Gholdengo, with the Gholdengo Illustration Rare, then the Metal types: Ferrothorn, Delta Species Metagross and Scizor ex. Gold and steel for the gold binder.",
    "The ones that shine: Zeraora, Victini, Lucario, Raikou, Buzzwole GX and Team Plasma Genesect, the gold-foil Greninja BREAK, and Base Set Charizard at its original number, the card everybody came for.",
    "Misty with her water: Slowpoke, Magikarp and both Lapras prints. N with his Zoroark: the Zorua line and Hisuian Zoroark. Supporter art has always been where this game is least careful and most interesting.",
    "The three Item cards, Ultra Ball, Poke Pad and Switch, under artwork of the trainers themselves. The tools of the game, on the page after the people.",
    "Evolution pairs: Marill and Azumarill, Cherubi and Cherrim, Igglybuff and Erika's Jigglypuff from the Classic Collection, each with artwork of what comes next.",
    "Cosmog to Cosmoem, Nidoran to Nidorina twice, once as the anniversary-stamped promo, and Vulpix to Ninetales. Every line starts at the outer edge and evolves toward the spine.",
    "The cards that fit no theme: Unown, Ditto, Wishiwashi, Exeggcute, Comfey and Seismitoad, and three Classic prints with no partner, Uxie, Crobat G and Dark Tyranitar. A page for a complete set.",
    "Nine more Pikachu Rares. With this page and the next, all thirty illustrators are in the binder.",
    "The last seven Pikachu Rares, and artwork of the mouse from the years these sets celebrate. Thirty years, thirty Pikachu, thirty pages.",
]
assert len(notes) == len(live['pages']) == 30, (len(notes), len(live['pages']))
for n in notes:
    assert '—' not in n
out = {
    'binderId': live['id'],
    'description': 'Every card of ME: 30th Celebration and its Classic Collection, once, in thirty pages. One idea to each open spread, the mouse first.',
    'pages': [{'id': p['id'], 'position': p['position'], 'title': p['title'], 'notes': n} for p, n in zip(live['pages'], notes)],
}
json.dump(out, open(os.path.join(here, 'thirty-notes.json'), 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print('ok', len(out['pages']), 'pages')
