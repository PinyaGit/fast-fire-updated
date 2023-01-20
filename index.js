const BUFF_BLAZING_ATTUNEMENT = 32058;

const JOB_ARCHER = 5;
const JOB_GUNNER = 9;
const JOB_NINJA = 11;

const SKILL_RAPID_FIRE = 8;
const SKILL_BURST_FIRE = 5;
const SKILL_BURNING_HEART = 15;

module.exports = function FastFire(dispatch) {
  let cid;
  let job;
  let model;
  let enabled = false;

  let aspd = 1;
  let atkid = 0x7F000000;
  let sent = {};
  let attacks = {};

  let buff = 0;

  dispatch.hook('S_LOGIN', 14, (event) => {
    ({cid, model} = event);

    job = (model - 10101) % 100;
    enabled = [JOB_ARCHER, JOB_GUNNER, JOB_NINJA].includes(job);
  });

  dispatch.hook('S_PLAYER_STAT_UPDATE', 15, event => {
    aspd = 1 + (event.bonusAttackSpeed / event.baseAttackSpeed);
  });

  dispatch.hook('S_ABNORMALITY_BEGIN', 5, (event) => {
    if (!enabled || !event.target.equals(cid)) return;

    if (job === JOB_NINJA && event.id === BUFF_BLAZING_ATTUNEMENT) {
      buff = Date.now() + event.duration;
    }
  });

  dispatch.hook('S_ABNORMALITY_REFRESH', 2, (event) => {
    if (!enabled || !event.target.equals(cid)) return;

    if (job === JOB_NINJA && event.id === BUFF_BLAZING_ATTUNEMENT) {
      buff = Date.now() + event.duration;
    }
  });

  dispatch.hook('S_ABNORMALITY_END', 1, (event) => {
    if (!enabled || !event.target.equals(cid)) return;

    if (job === JOB_NINJA && event.id === BUFF_BLAZING_ATTUNEMENT) {
      buff = 0;
    }
  });

  dispatch.hook('C_START_COMBO_INSTANT_SKILL', 7, (event) => {
    if (!enabled) return;

    const skill = event.skill - 0x4000000;
    const group = Math.floor(skill / 10000);
    const hit = skill % 100;

    let speed = aspd;
    let baseDuration = -1;

    if (job === JOB_ARCHER && group === SKILL_RAPID_FIRE) {
      // send sActionEnd for previous attack in combo
      const last = attacks[event.skill - 1];
      if (last) {
        clearTimeout(last.timer);
        last.timer = null;

        dispatch.toClient('S_ACTION_END', 5, {
          source: cid,
          x: event.x,
          y: event.y,
          z: event.z,
          w: event.w,
          model: model,
          skill: event.skill - 1,
          unk: 6,
          id: last.atkid,
        });
      }

      baseDuration = [425, 600, 700, 700, 700, 700, 1235][hit] || -1;
    }

    if (job === JOB_GUNNER && group === SKILL_BURST_FIRE) {
      if(hit === 0) speed *= 0.9;
      else speed = 1;
      baseDuration = (hit === 0) ? 1275 : 122;
    }

    // if no match, don't fake it
    if (baseDuration < 0) return;

    // send sActionStage
    dispatch.toClient('S_ACTION_STAGE', 9, {
      source: cid,
      x: event.x,
      y: event.y,
      z: event.z,
      w: event.w,
      model: model,
      skill: event.skill,
      stage: 0,
      speed: speed,
      id: atkid,
      unk: 1,
      unk1: 0,
      toX: 0,
      toY: 0,
      toZ: 0,
      unk2: 0,
      unk3: 0,
      movement: []
    });

    const timer = setTimeout(forceEnd, baseDuration / speed, event);

    attacks[event.skill] = { atkid, timer };
    atkid++;
  });

  dispatch.hook('C_START_SKILL', 8, (event) => {
    if (!enabled || job !== JOB_NINJA) return;

    const skill = event.skill - 0x4000000;
    const group = Math.floor(skill / 10000);
    const hit = skill % 100;

    if (group !== SKILL_BURNING_HEART) return;

    const speed = aspd * (Date.now() < buff ? 1.3 : 1);
    const baseDuration = (hit === 0) ? 880 : 390;

    dispatch.toClient('S_ACTION_STAGE', 9, {
      source: cid,
      x: event.x1,
      y: event.y1,
      z: event.z1,
      w: event.w,
      model: model,
      skill: event.skill,
      stage: 0,
      speed: speed,
      id: atkid,
      unk: 1,
      unk1: 0,
      toX: 0,
      toY: 0,
      toZ: 0,
      unk2: 0,
      unk3: 0,
      movement: []
    });

    const timer = setTimeout(forceEnd, baseDuration / speed, event);

    attacks[event.skill] = { atkid, timer };
    atkid++;
  });

  dispatch.hook('S_ACTION_STAGE', 9, (event) => {
    if (!enabled || !event.source.equals(cid)) return;
    if (attacks[event.skill]) return false;
  });

  dispatch.hook('S_ACTION_END', 5, (event) => {
    if (!enabled || !event.source.equals(cid)) return;

    const attack = attacks[event.skill];
    if (!attack) return;

    delete attacks[event.skill];

    if (attack.timer) {
      clearTimeout(attack.timer);
      event.id = attack.atkid;
      return true;
    } else {
      return false;
    }
  });

  function forceEnd(event) {
    const attack = attacks[event.skill];
    if (!attack) return;

    attack.timer = null;

    dispatch.toClient('S_ACTION_END', 5, {
      source: cid,
      x: event.x || event.x1,
      y: event.y || event.y1,
      z: event.z || event.z1,
      w: event.w,
      model: model,
      skill: event.skill,
      unk: 0,
      id: attack.atkid,
    });
  }
};
