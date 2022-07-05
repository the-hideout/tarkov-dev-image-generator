let items = false;
let presets = false;
let ttPresets = false;
const weaponTypes = [
    '5447b5cf4bdc2d65278b4567', // pistol
    '617f1ef5e8b54b0998387733', // revolver
    '5447b5e04bdc2d62278b4567', // smg
    '5447b5f14bdc2d61278b4567', // assault rifle
    '5447b5fc4bdc2d87278b4567', // assault carbine
    '5447b6094bdc2dc3278b4567', // shotgun
    '5447b6194bdc2d67278b4567', // marksman rifle
    '5447b6254bdc2dc3278b4568', // sniper rifle
    '5447bed64bdc2d97278b4568', // machine gun
    '5447bedf4bdc2d87278b4568', // grenade launcher
    '5447bee84bdc2dc3278b4569', // special weapon (??)
];

const magazineTypes = [
    '5448bc234bdc2d3c308b4569', // regular magazine
    '610720f290b75a49ff2e5e25', // cylinder magazine
    '627a137bf21bc425b06ab944' // spring driven cylinder magazine
];

const buildPreset = (preset) => {
    let built = {};
    let baseSlot = false;
    for (let i = 0; i < preset._items.length; i++) {
        const part = preset._items[i];
        newPart = {
            partId: part._id,
            itemId: part._tpl,
            contains: {}
        }
        built[part._id] = newPart;
        if (part.slotId) {
            built[part.parentId].contains[part.slotId] = newPart;
        } else {
            baseSlot = part._id;
        }
    }
    built = built[baseSlot];
    const slots = [];
    const getContainedSlots = (part) => {
        const item = items[part.itemId];
        if (item._props.Slots) {
            for (let s = 0; s < item._props.Slots.length; s++) {
                const slot = item._props.Slots[s];
                const mergedSlot = {
                    name: slot._name,
                    item: false
                };
                slots.push(mergedSlot);
                if (part.contains[slot._name]) {
                    mergedSlot.item = part.contains[slot._name].itemId;
                    getContainedSlots(part.contains[slot._name]);
                }
            }
        }
        if (item._props.Cartridges) {
            for (let s = 0; s < item._props.Cartridges.length; s++) {
                const slot = item._props.Cartridges[s];
                slots.push({
                    name: slot._name,
                    item: false
                });
            }
        }
        if (item._props.Chambers) {
            for (let s = 0; s < item._props.Chambers.length; s++) {
                const slot = item._props.Chambers[s];
                slots.push({
                    name: slot._name,
                    item: false
                });
            }
        }
    }
    getContainedSlots(built);
    //console.log(slots);
    return slots;
};

// <3 to Moritz
// https://github.com/RatScanner/RatStash/blob/master/RatStash/CacheHashIndexParser.cs
const getStringHash = (str) => {
    var hash1 = 5381 | 0;
    var hash2 = hash1 | 0;
  
    for (var i = 0; i < str.length - 1; i += 2) {
        var c = str.charCodeAt(i)
        hash1 = ToInt32((hash1 << 5) + hash1) ^ c;
        c = str.charCodeAt(i + 1);
        if (isNaN(c)) {
            break;
        }
      hash2 = ToInt32((hash2 << 5) + hash2) ^ c;
    }
  
    return ToInt32(hash1 + (Math.imul(hash2, 1566083941)));
};

const ToInt32 = (x) => {
    var uint32 = x % Math.pow(2, 32);
    if (uint32 >= Math.pow(2, 31)) {
        return uint32 - Math.pow(2, 32)
    } else {
        return uint32;
    }
};

const getHashSum = (item) => {
    //let num = 391 + 
};

const getItemHash = (itemId) => {
    if (!items || !presets || !ttPresets) throw new Error('Must initialize with items and presets!');
    let hash = 17;
    hash ^= getSingleItemHash(itemId);
    const item = items[itemId];
    if (!item) return hash;

    if (weaponTypes.includes(item._parent)) {
        hash = getContainerHash(hash, item);
    }
    if (item._parent == '5485a8684bdc2da71d8b4567') {
        //ammo
        hash ^= (27 * 56);
    } 
    return hash;
};

const getContainerHash = (hash, item) => {
    let preset = false;
    for (const presetId in ttPresets) {
        //console.log(ttPresets[i]);
        if (ttPresets[presetId].baseId == item._id && ttPresets[presetId].default) {
            //console.log(`matched ${ttPresets[presetId].name}`);
            preset = presets[ttPresets[presetId].id];
            break;
        }
    }
    if (!preset) throw new Error(`Default preset not found for ${item._id}`);
    //console.log(item._name);
    //console.log(buildPreset(preset));
    slots = buildPreset(preset);
    //console.log(slots);
    for (let i = 0; i < slots.length; i++) {
        slot = slots[i];
        hash ^= getStringHash(slot.name);
        let cartridges = false;
        if (slot.name == 'cartridges') {
            continue;
        }
        if (slot.name == 'mod_magazine' && slot.item) {
            if (i+1 < slots.length && slots[i+1].name == 'cartridges') {
                cartridges = slots[i+1].item;
            }
        }
        //if (slot.item) {
            hash ^= getSingleItemHash(slot.item, cartridges);
        //}
    }
    return hash;
}

const getSingleItemHash = (itemId, cartridges) => {
    let hash = 0;
    if (!itemId) return hash;
    hash ^= getStringHash(itemId);
    const item = items[itemId];
    if (!item) return hash;

    if (item._parent == '5a2c3a9486f774688b05e574' || item._parent == '5d21f59b6dbe99052b54ef83') {
        // hash for nvgs and thermal vision
        hash ^= 23;
    } else if (item._parent == '57bef4c42459772e8d35a53b' || item._parent == '5a341c4086f77401f2541505') {
        // ArmoredEquipment or Headwear
        if (item._props && item._props.HasHinge) {
            hash ^= 23;
        }
    } else if (item._parent == '55818a594bdc2db9688b456a') {
        // stock
        if (item._props && item._props.Foldable) {
            hash ^= 23 << 1;
        }
    } else if (magazineTypes.includes(item._parent)) {
        // magazine
        //hash ^= getStringHash('cartridges');
        if (!cartridges) {
            hash ^= 24 << 2;
        } else {
            hash ^= 23 + getMaxVisibleAmmo(itemId, cartridges.count) << 2;
        }
    } 

    return hash;
};

// https://github.com/RatScanner/RatStash/blob/master/RatStash/Item/CompoundItem/WeaponMod/GearMod/Magazine.cs
const getVisibleAmmoRanges = (itemId) => {
    const visibleAmmoRangesString = items[itemId]._props.VisibleAmmoRangesString;
    if (!visibleAmmoRangesString) {
        return [{start: 1, end: 2}];
    }
    const ranges = [];
    const splits = visibleAmmoRangesString.split(';');
    for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const range = split.split('-');
        ranges.push({start: Number(range[0]), end: Number(range[1])});
    }
    return ranges;
};

const getMaxVisibleAmmo = (itemId, cartridgeCount) => {
    const visibleAmmoRanges = getVisibleAmmoRanges(itemId);

    let i = 0;
    while (i < visibleAmmoRanges.length) {
        const { start, end } = visibleAmmoRanges[i];
        if (start <= cartridgeCount && end >= cartridgeCount) return cartridgeCount;
        if (cartridgeCount >= start) i++;
        else return i != 0 ? visibleAmmoRanges[i - 1].end : start;
    }

    return visibleAmmoRanges[visibleAmmoRanges.length - 1][1]
}
module.exports = {
    getItemHash: getItemHash,
    init: (bsgItems, bsgPresets, ttpresets) => {
        items = bsgItems;
        presets = bsgPresets;
        ttPresets = ttpresets;
    }
};
