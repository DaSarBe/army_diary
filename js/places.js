/* 地點座標、中文名稱與任務步驟規劃（objective -> 3D 世界中可執行的步驟） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Places = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 地點：label 與各地圖座標 [x, z]。post=true 表示世界裡要立一個路標牌。 */
  var PL = {
    home: { label: '家門口', home: [-14, 1.2] },
    street: { label: '街上', home: [0, -10], post: 1 },
    park: { label: '公園', home: [6, 11.8] },
    grandpa_house: { label: '爺爺家', home: [18, 2.7] },
    night_market: { label: '夜市', home: [6, -4.9] },
    barber_shop: { label: '理髮店', home: [-20, -18.7] },
    store: { label: '便利商店', home: [-4, -18.7] },

    training_gate: { label: '營門口', camp1: [0, 10.8] },
    training_center: { label: '新訓中心', camp1: [0, 10.8] },
    checkin_line: { label: '報到線', camp1: [0, 6.4], post: 1 },
    bag_check: { label: '檢查台', camp1: [4.8, 6.4] },
    supply_room: { label: '補給室', camp1: [-26, 10.4], unit: [-26, -10] },
    washroom: { label: '盥洗室', camp1: [29, -1.8] },
    shooting_range: { label: '靶場', camp1: [6, -30.8] },
    sentry_post: { label: '衛哨', camp1: [27, 9.6], unit: [-27.4, 6] },
    phone_booth: { label: '電話亭', camp1: [9.5, 2.7], unit: [7, -4.2] },
    classroom: { label: '教室', camp1: [18, 10.4], unit: [27, 1.4] },
    px: { label: '福利社', camp1: [-10, 10.4], unit: [-14, 1.4] },
    infirmary: { label: '醫務所', camp1: [-18, 10.4], unit: [-27, 1.4] },
    barracks: { label: '營舍', camp1: [16, -1.0], unit: [14, -9.5] },
    barracks_bunk: { label: '床位', camp1: [12.5, -1.0], unit: [11, -9.5] },
    assigned_bunk: { label: '指定床位', unit: [11, -9.5] },
    assembly_ground: { label: '集合場', camp1: [0, -14], unit: [0, -20] },
    training_field: { label: '訓練場', camp1: [0, -14], unit: [0, -20] },

    unit_gate: { label: '營門', unit: [0, 10.2] },
    unit_base: { label: '連隊廣場', unit: [2, -5] },
    station: { label: '公車站', unit: [10, 15.6] },
    px_outside: { label: '營外小店', unit: [-12, 16.6] },
    kitchen: { label: '伙房', unit: [-14, -9.5] },
    counselor_office: { label: '輔導室', unit: [-6, 1.2] },
    exercise_field: { label: '演訓場', unit: [0, -31] },
    base_track: { label: '營區跑道', unit: [-12.5, -34] },
    rooftop: { label: '營舍屋頂', unit: [14, -18.8] },
    duty_area: { label: '勤務區', unit: [0, -3], post: 1 },
    village: { label: '受災街區', unit: [21, -46.5] },
    levee: { label: '堤防', unit: [14, -45] },

    armory: { label: '軍械室', unit: [24, -24.4] },
    obstacle_course: { label: '障礙場', unit: [24, -34.5] },
    gun_park: { label: '砲兵陣地', unit: [21, -25] },
    ammo_depot: { label: '彈藥庫', unit: [30, -27.2] },
    fdc: { label: '射擊指揮所', unit: [21, -29] },
    runway: { label: '跑道', unit: [24, -24] },
    hangar: { label: '機棚', unit: [24, -28.4] },
    base_perimeter: { label: '基地外圍', unit: [33, -27] },
    alert_post: { label: '警戒哨', unit: [32, -32.2] },
    ship_deck: { label: '艦艇甲板', unit: [24, -27.5] },
    ship_corridor: { label: '艦艇通道', unit: [30, -27.5] },
    warehouse: { label: '倉庫', unit: [26, -26.3] },
    motor_pool: { label: '車輛場', unit: [17, -23.5] },
    fire_point: { label: '起火點', unit: [31, -31] }
  };

  /* 具名 NPC 的位置：[x, z, 朝向, 外型, 是否揮手] */
  var NPCSPOT = {
    home: {
      npc_mom: [-15.8, 1.6, Math.PI, 'mom', 1], npc_dad: [-12.2, 1.6, Math.PI, 'dad'],
      npc_grandpa: [18, 1.0, Math.PI, 'gpa'], npc_friend_chen: [4.7, -5.8, Math.PI / 2, 'fr1', 1],
      npc_barber: [-18.4, -18.5, 0, 'barber'], npc_postman: [-8.6, -6.2, 0, 'post']
    },
    camp1: {
      npc_sgt_lin: [2.6, 7.8, -Math.PI / 2, 'sgt'], npc_squad_leader_hsu: [2.4, -12, -Math.PI / 2, 'kai'],
      npc_counselor_wang: [16.4, 10.8, 0, 'cpt'], npc_akai: [22.8, -1.6, Math.PI, 'kai'],
      npc_medic: [-16.4, 10.8, 0, 'med'], npc_auntie: [-8.4, 10.8, 0, 'cook'],
      npc_mom: [-2.6, 12, Math.PI, 'mom', 1], npc_dad: [-1, 12.2, Math.PI, 'dad']
    },
    unit: {
      npc_captain_huang: [15.6, 1.9, Math.PI, 'cpt'], npc_counselor_lee: [-4.6, 1.5, Math.PI, 'cpt'],
      npc_senior_chou: [12.4, -9.4, Math.PI / 2, 'sen'], npc_junior_hsiao: [6.6, 7.2, Math.PI, 'rec'],
      npc_akai: [15.6, -9.4, -Math.PI / 2, 'kai'], npc_medic: [-25.5, 1.9, Math.PI, 'med'],
      npc_auntie: [-12.4, 1.9, Math.PI, 'cook'], npc_recruiter: [28.6, 1.9, Math.PI, 'cpt'],
      npc_sgt_lin: [3, -17.6, Math.PI, 'sgt']
    }
  };
  var UNIT_NPC = {
    infantry: { npc_sgt_kuo: [24, -22.6, Math.PI, 'sgt'] },
    artillery: { npc_sgt_kuo: [22.6, -23.2, Math.PI, 'sgt'] },
    airforce: { npc_ground_crew_tsai: [25.6, -26.6, Math.PI, 'med'] },
    navy: { npc_bosun_yang: [25.6, -26.2, Math.PI, 'sgt'] },
    logistics: { npc_supply_sgt_hung: [27.6, -24.8, Math.PI, 'cook'] }
  };

  var TL = {
    packing_list: '行李清單', bag: '行李袋', night_market: '夜市', storage_boxes: '儲藏箱', park_loop: '公園跑道',
    bag_check: '行李檢查', issued_gear: '領用裝備', bunk: '床鋪', lights_out: '熄燈後潛行', locker: '置物櫃',
    recruits: '同梯新兵', range_officer: '靶場官', empty_chamber: '空膛檢查', search_spots: '可能藏水壺的地方',
    next_sentry: '接哨的同袍', sentry_route: '巡邏路線', formation_marks: '隊形標示', train_3000: '三千公尺',
    track_3000: '三千公尺跑道', duty_area: '勤務區', station: '車站', camp_areas: '營區環境', equipment_list: '裝備清冊',
    night_route: '夜行軍路線', desk_documents: '書桌上的文件', junior_bunk: '學弟的床位', handover_list: '交接清冊',
    squad_members: '班上弟兄', recruit_bunks: '新兵床位', farewell_npcs: '要道別的人', personal_items: '個人物品',
    juniors: '學弟', cover_points: '掩蔽點', obstacle_course: '五百公尺障礙', base_track: '營區跑道', fod_items: '跑道異物',
    tools: '工具', tool_board: '工具板', perimeter: '基地外圍', alert_post: '警戒哨', deck_sections: '甲板區段',
    watertight_doors: '水密門', dummy_casualty: '假傷患', shelves: '貨架', receivers: '收貨單位', suspect: '可疑人員',
    duty_officer: '值星官', duty_officer_patrol: '值星官巡查', fallen_trees: '倒塌的樹', family: '家人', supply_cart: '補給推車',
    supply_truck: '補給卡車', recruit_squad: '新兵班', objective: '目標點', position: '陣地', sign_contract: '志願役合約',
    military_song: '軍歌', gun_commands: '砲操口令', dress_up: '著裝', emplace_gun: '砲兵放列', watch_duty: '值更',
    home: '家', grandpa_house: '爺爺家', barber_shop: '理髮店', park_loop: '公園跑道',
    it_draft_notice: '兵單', it_photo_album: '爺爺的相簿', gear_bag: '裝備袋', pen: '原子筆', canteen: '水壺',
    snack_bag: '零食袋', sandbag: '沙包', supplies: '補給品', package: '包裹', practice_shell: '訓練彈',
    extinguisher: '滅火器', ingredients: '食材', handover_items: '交接物品', returned_gear: '繳回的裝備', drinks: '飲料',
    pushup: '伏地挺身', shooting: '射擊', lottery: '抽籤', fold_blanket: '折棉被', rifle_assembly: '步槍分解結合',
    fire_calc: '射擊諸元計算', inventory_count: '庫存清點', duty_roster: '勤務排班', cooking: '伙房幫廚', essay: '寫心得',
    rehab: '復健', rope_coil: '收纜繩',
    visit_route: '懇親路線', village: '受災街區', units: '各單位', sickbay: '醫務室', base_tour: '營區參觀'
  };
  var TEMP_NPC = {
    recruits: { preset: 'rec', name: '新兵' }, range_officer: { preset: 'cpt', name: '靶場官' },
    next_sentry: { preset: 'rec', name: '接哨的同袍' }, suspect: { preset: 'rec', name: '可疑人員' },
    duty_officer: { preset: 'cpt', name: '值星官' }, squad_members: { preset: 'rec', name: '班上弟兄' },
    juniors: { preset: 'rec', name: '學弟' }, receivers: { preset: 'rec', name: '收貨的弟兄' }
  };
  var FAREWELL = [['kai', '阿凱'], ['sen', '周學長'], ['rec', '蕭學弟'], ['cpt', '黃連長'], ['cpt', '李輔導長']];
  var ESCORT = {
    family: { pre: [{ preset: 'mom' }, { preset: 'dad' }], name: '家人' },
    supply_cart: { pre: [{ kind: 'cart' }], name: '補給推車' },
    supply_truck: { pre: [{ kind: 'truck' }], name: '補給卡車' },
    dummy_casualty: { pre: [{ preset: 'rec', name: '假傷患' }], name: '假傷患' },
    recruit_squad: { pre: [{ preset: 'rec' }, { preset: 'rec' }, { preset: 'rec' }], name: '新兵班' },
    npc_junior_hsiao: { pre: [{ preset: 'rec', name: '蕭學弟' }], name: '蕭學弟' }
  };
  var ROUTES = {
    visit_route: { map: 'camp1', pts: [[-18, -11], [-12, -22], [2, -13]] },
    units: { map: 'unit', pts: [[17, -24], [24, -26], [31, -27]] },
    base_tour: { map: 'unit', pts: [[-14, 2.5], [14, -8], [0, -20]] },
    night_route: { map: 'unit', pts: [[0, 6], [-20, -5], [-24, -22], [-8, -36], [14, -34], [10, -12]] },
    obstacle_course: { map: 'unit', pts: [[16, -33], [32, -33], [32, -24], [16, -24]] },
    track_3000_camp1: { map: 'camp1', pts: [[-12, -4], [12, -4], [12, -24], [-12, -24]] },
    base_track: { map: 'unit', pts: [[-22, -26], [-4, -34], [-12, -42], [-26, -38]] },
    park_loop: { map: 'home', pts: [[1, 15], [6, 19.5], [11, 15], [6, 10.5]] }
  };
  var ANCH = {
    bag: 'home', packing_list: 'home', desk_documents: 'home', storage_boxes: 'grandpa_house', park_loop: 'park',
    bag_check: 'bag_check', bunk: 'barracks', lights_out: 'barracks', locker: 'barracks', empty_chamber: 'shooting_range',
    search_spots: 'barracks', formation_marks: 'assembly_ground', sentry_route: 'sentry_post', camp_areas: 'unit_base',
    equipment_list: 'barracks', junior_bunk: 'barracks', handover_list: 'unit_base', recruit_bunks: 'barracks',
    personal_items: 'barracks', cover_points: 'training_field', fod_items: 'runway', tools: 'hangar', tool_board: 'hangar',
    perimeter: 'base_perimeter', deck_sections: 'ship_deck', watertight_doors: 'ship_corridor', shelves: 'warehouse',
    fallen_trees: 'village', duty_officer_patrol: 'rooftop', issued_gear: 'supply_room', night_market: 'night_market',
    track_3000: 'assembly_ground', military_song: 'assembly_ground', gun_commands: 'gun_park', dress_up: 'barracks',
    emplace_gun: 'gun_park', watch_duty: 'ship_deck', objective: 'training_field', position: 'exercise_field',
    sign_contract: 'classroom', duty_officer: 'sentry_post', handover_items: 'unit_base', sandbag: 'unit_base',
    supplies: 'unit_base'
  };
  var MG_ANCH = {
    pushup: 'training_field', shooting: 'shooting_range', fold_blanket: 'barracks', rifle_assembly: 'armory',
    fire_calc: 'fdc', inventory_count: 'warehouse', duty_roster: 'unit_base', cooking: 'kitchen', essay: 'classroom',
    rehab: 'infirmary', rope_coil: 'ship_deck', lottery: 'assembly_ground'
  };

  function hash(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
  function placeOf(id, map) {
    var p = PL[id];
    if (!p) return null;
    if (p[map]) return { map: map, x: p[map][0], z: p[map][1], label: p.label, id: id };
    var ks = ['home', 'camp1', 'unit'].filter(function (k) { return p[k]; });
    if (!ks.length) return null;
    return { map: ks[0], x: p[ks[0]][0], z: p[ks[0]][1], label: p.label, id: id };
  }
  function npcSpot(id, map, unit) {
    var m = NPCSPOT[map] && NPCSPOT[map][id];
    if (!m && map === 'unit' && UNIT_NPC[unit] && UNIT_NPC[unit][id]) m = UNIT_NPC[unit][id];
    return m || null;
  }
  function tl(id) { return TL[id] || id; }
  function ring(cx, cz, n, r, seed) {
    var out = [], a0 = (hash(seed || 'r') % 360) * Math.PI / 180, i;
    for (i = 0; i < n; i++) {
      var a = a0 + i * Math.PI * 2 / n, rr = r * (n === 1 ? 1 : 0.85 + 0.3 * ((i * 7) % 3) / 2);
      out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
    return out;
  }
  function pt(x, z, label, extra) { return Object.assign({ x: x, z: z, label: label }, extra || {}); }
  function npcName(D, id) { return D.npc[id] ? D.npc[id].name : id; }

  /* 規劃單一步驟。ctx: {D:資料, S:狀態, map:目前所在地圖, unit:單位, prev:{map,x,z}|null} */
  function plan(q, idx, ctx) {
    var D = ctx.D, o = q.objectives[idx], prevO = idx > 0 ? q.objectives[idx - 1] : null;
    var cm = ctx.map, unit = ctx.unit, t = o.target, n = typeof o.count === 'number' ? o.count : 1;
    var limit = typeof o.timeLimit === 'number' ? Math.max(25, Math.min(90, Math.round(o.timeLimit / 9))) : null;
    var qloc = placeOf(q.location, cm) || placeOf('unit_base', 'unit');
    function anchorOf(target) {
      var id = ANCH[target] || (PL[target] ? target : null);
      var pl = id ? placeOf(id, cm) : null;
      if (pl && pl.map !== cm && qloc && qloc.map === cm) pl = null;
      return pl || qloc;
    }
    var S = { q: q, idx: idx, type: o.type, target: t, count: n, limit: limit };
    var a, i, ps, key;
    switch (o.type) {
      case 'talk':
      case 'report': {
        if (t.indexOf('npc_') === 0) {
          var sp = npcSpot(t, cm, unit);
          var mp = cm;
          if (!sp) {
            var other = ['home', 'camp1', 'unit'].filter(function (m) { return npcSpot(t, m, unit); })[0];
            if (qloc && qloc.map !== cm && npcSpot(t, qloc.map, unit)) { mp = qloc.map; sp = npcSpot(t, mp, unit); }
            else if (other && false) { mp = other; }
          }
          if (sp) {
            S.kind = 'talk'; S.map = mp; S.pts = [pt(sp[0], sp[1], npcName(D, t), { npc: t })];
            S.text = '與「' + npcName(D, t) + '」交談';
          } else {
            var ph = placeOf('phone_booth', cm) || placeOf('phone_booth', 'unit');
            S.kind = 'phone'; S.map = ph.map; S.npcId = t;
            S.pts = [pt(ph.x, ph.z, '電話亭', { phone: t })];
            S.text = '到電話亭打給「' + npcName(D, t) + '」';
          }
        } else {
          a = anchorOf(t === 'farewell_npcs' ? 'unit_base' : t);
          var tn = t === 'farewell_npcs' ? Math.min(n, 5) : n;
          ps = ring(a.x, a.z, tn, 5, q.id + t);
          S.kind = 'talk'; S.map = a.map; S.count = tn; S.temp = true;
          S.pts = ps.map(function (p, k) {
            var tp = TEMP_NPC[t] || { preset: 'rec', name: tl(t) };
            if (t === 'farewell_npcs') { var f = FAREWELL[k % 5]; tp = { preset: f[0], name: f[1] }; }
            return pt(p[0], p[1], tp.name, { tempNpc: tp, free: true });
          });
          S.text = '與' + tl(t) + '交談（' + tn + '）';
        }
        break;
      }
      case 'goto': {
        a = placeOf(t, cm);
        if (!a) a = anchorOf(t);
        S.kind = 'reach'; S.map = a.map;
        if (n > 1) {
          S.pts = ring(a.x, a.z, n, 6, q.id + t).map(function (p, k) { return pt(p[0], p[1], tl(t) + ' ' + (k + 1), { free: true }); });
          S.seq = true;
        } else S.pts = [pt(a.x, a.z, a.label || tl(t))];
        S.text = '前往：' + (a.label || tl(t));
        if (typeof o.timeLimit === 'number') {
          S.limit = Math.max(25, Math.min(80, Math.round(o.timeLimit / 12) + 15));
        }
        break;
      }
      case 'inspect':
      case 'clean':
      case 'clear': {
        a = anchorOf(t);
        S.kind = 'inspect'; S.map = a.map;
        S.verb = o.type === 'inspect' ? '檢查' : o.type === 'clean' ? '打掃' : '清除';
        ps = n > 1 ? ring(a.x, a.z, n, 5, q.id + t) : [[a.x, a.z + (a.id === t ? 0 : 2.4)]];
        S.pts = ps.map(function (p, k) { return pt(p[0], p[1], tl(t) + (n > 1 ? ' ' + (k + 1) : ''), { free: n > 1 || a.id !== t, prop: 'crate' }); });
        S.text = S.verb + '：' + tl(t) + (n > 1 ? '（' + n + '）' : '');
        S.special = t === 'bag' ? 'bag' : t === 'bag_check' ? 'bagcheck' : null;
        break;
      }
      case 'collect': {
        a = anchorOf(t);
        S.kind = 'collect'; S.map = a.map;
        S.pts = ring(a.x, a.z, n, 5.5, q.id + t).map(function (p, k) { return pt(p[0], p[1], tl(t) + ' ' + (k + 1), { free: true, prop: 'item' }); });
        S.text = '收集：' + tl(t) + '（' + n + '）';
        break;
      }
      case 'carry': {
        var pr = t.split(':'), item = pr[0], dst = pr[1];
        S.kind = 'carry'; S.item = item;
        S.itemName = (D.items[item] && D.items[item].name) || (D.tune.tempItems && D.tune.tempItems[item]) || tl(item);
        S.qty = n;
        var auto = prevO && (prevO.type === 'talk' || prevO.type === 'inspect' || prevO.type === 'collect' || prevO.type === 'goto');
        var dstPl = dst.indexOf('npc_') === 0 ? null : (placeOf(dst, cm) || null);
        var dnpc = dst.indexOf('npc_') === 0 ? npcSpot(dst, cm, unit) : null;
        var base = ctx.prev && ctx.prev.map === cm ? ctx.prev : (qloc.map === cm ? qloc : placeOf('unit_base', cm) || qloc);
        var dx, dz, dlab, dmap = cm;
        if (dnpc) { dx = dnpc[0]; dz = dnpc[1]; dlab = npcName(D, dst); }
        else if (dstPl) { dx = dstPl.x; dz = dstPl.z; dlab = dstPl.label; dmap = dstPl.map; }
        else {
          var fa = ring(base.x, base.z, 1, 9, q.id + dst)[0];
          dx = fa[0]; dz = fa[1]; dlab = tl(dst);
        }
        if (dnpc || dstPl || true) {
          S.map = dmap;
          S.dst = pt(dx, dz, dlab, { npc: dnpc ? dst : null, free: !dnpc && !dstPl, prop: (!dnpc && !dstPl) ? 'post' : null });
          S.dstNpc = !!dnpc;
          if (!dnpc && !dstPl && dst.indexOf('npc_') === 0) S.dstNpc = false;
        }
        if (auto) S.pickup = null;
        else {
          var sx = base.x, sz = base.z;
          if (Math.hypot(sx - dx, sz - dz) < 8) { var rr = ring(dx, dz, 1, 11, q.id + item)[0]; sx = rr[0]; sz = rr[1]; }
          S.pickup = pt(sx, sz, S.itemName + (n > 1 ? ' ×' + n : ''), { free: true, prop: 'pile' });
        }
        S.text = '搬運：' + S.itemName + (n > 1 ? ' ×' + n : '') + '，送到' + dlab;
        break;
      }
      case 'run':
      case 'march':
      case 'patrol':
      case 'move': {
        var rkey = t === 'track_3000' ? (cm === 'camp1' ? 'track_3000_camp1' : 'base_track') : t;
        var rt = ROUTES[rkey];
        S.kind = 'reach'; S.seq = true;
        if (rt) {
          S.map = rt.map;
          var laps = o.type === 'run' ? Math.min(n, 2) : 1, pts = [], L;
          for (L = 0; L < laps; L++) rt.pts.forEach(function (p, k) { pts.push(pt(p[0], p[1], tl(t) + ' ' + (k + 1), { free: false })); });
          S.pts = pts;
        } else {
          a = anchorOf(t); S.map = a.map;
          var cnt = o.type === 'patrol' ? Math.max(3, n) : o.type === 'move' ? n : 4;
          S.pts = ring(a.x, a.z, cnt, o.type === 'move' ? 9 : 6.5, q.id + t).map(function (p, k) { return pt(p[0], p[1], tl(t) + ' ' + (k + 1), { free: true }); });
        }
        S.text = { run: '跑完：', march: '行軍：', patrol: '巡邏：', move: '依序前進：' }[o.type] + tl(t);
        if (typeof o.timeLimit === 'number') S.limit = Math.max(30, Math.min(90, Math.round(o.timeLimit / 10) + 20));
        break;
      }
      case 'escort': {
        var es = ESCORT[t] || { pre: [{ preset: 'rec' }], name: tl(t) };
        S.kind = 'escort'; S.followers = es.pre; S.escName = es.name;
        var c = o.count, rt2 = typeof c === 'string' ? ROUTES[c] : null;
        if (rt2) { S.map = rt2.map; S.pts = rt2.pts.map(function (p, k) { return pt(p[0], p[1], '路線 ' + (k + 1), { free: false }); }); S.seq = true; }
        else {
          var dp = (typeof c === 'string' && placeOf(c === 'sickbay' ? 'infirmary' : c, cm)) || qloc;
          S.map = dp.map; S.pts = [pt(dp.x, dp.z, dp.label)];
        }
        S.start = ctx.prev && ctx.prev.map === S.map ? { x: ctx.prev.x, z: ctx.prev.z } : { x: qloc.x, z: qloc.z };
        S.text = '護送「' + es.name + '」到' + S.pts[S.pts.length - 1].label;
        if (typeof o.timeLimit === 'number') S.limit = Math.max(40, Math.min(90, Math.round(o.timeLimit / 6) + 20));
        break;
      }
      case 'minigame':
      case 'rhythm':
      case 'timed':
      case 'stealth':
      case 'defend': {
        var anc = o.type === 'minigame' ? (MG_ANCH[t] || t) : t;
        a = (o.type === 'minigame' ? placeOf(anc, cm) : null) || anchorOf(anc);
        if (ctx.prev && ctx.prev.map === a.map && Math.hypot(ctx.prev.x - a.x, ctx.prev.z - a.z) < 30 && o.type !== 'minigame') a = { map: ctx.prev.map, x: ctx.prev.x, z: ctx.prev.z, label: a.label };
        else if (a.map !== cm && qloc.map === cm) a = qloc;
        S.kind = 'overlay'; S.map = a.map; S.mg = t;
        S.pts = [pt(a.x, a.z + (o.type === 'minigame' ? 0 : 1.2), a.label || tl(t), { prop: 'board' })];
        S.text = '開始：' + tl(t) + '（' + (a.label || '') + '）';
        if (typeof o.timeLimit === 'number') S.mgLimit = Math.min(o.timeLimit, 120);
        break;
      }
      case 'check':
        S.kind = 'check'; S.map = cm; S.pts = []; S.text = '判定：' + ((D.rpg.checks.types[t] || {}).name || t);
        break;
      case 'decide':
        S.kind = 'decide'; a = anchorOf(t); S.map = a.map; S.pts = [pt(a.x, a.z, a.label)]; S.text = '做出決定';
        break;
      case 'rest': {
        var home = t === 'home';
        a = placeOf(t, home ? 'home' : cm) || qloc;
        S.kind = 'rest'; S.map = a.map; S.home = home; S.days = home ? n : 0;
        S.pts = [pt(a.x, a.z, a.label)]; S.verb = home ? '回家休息' : '休息';
        S.text = home ? '回家放假休息（' + n + ' 天）' : '到' + a.label + '休息';
        break;
      }
      default:
        S.kind = 'reach'; a = anchorOf(t); S.map = a.map; S.pts = [pt(a.x, a.z, a.label)]; S.text = '前往：' + a.label;
    }
    if (!S.map) S.map = cm;
    S.endsAt = null;
    return S;
  }

  return {
    PL: PL, NPCSPOT: NPCSPOT, UNIT_NPC: UNIT_NPC, TL: TL, ROUTES: ROUTES,
    placeOf: placeOf, npcSpot: npcSpot, tl: tl, plan: plan, ring: ring, hash: hash,
    mapPlaces: function (map) {
      return Object.keys(PL).filter(function (k) { return PL[k][map]; }).map(function (k) { return { id: k, x: PL[k][map][0], z: PL[k][map][1], label: PL[k].label, post: PL[k].post }; });
    }
  };
});
