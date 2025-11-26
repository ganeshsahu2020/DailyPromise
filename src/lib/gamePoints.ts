import {awardPointsWithKey, makeIdemKey} from "@/lib/points";

export type GameKey="mathsprint"|"wordbuilder"|"memory"|"starcatcher"|"jump";

const REASONS:Record<GameKey,string>={
  mathsprint:"Math Sprint reward",
  wordbuilder:"Word Builder reward",
  memory:"Memory Match reward",
  starcatcher:"StarCatcher reward",
  jump:"Jumping Platformer reward"
};

export async function awardGameSegment(childId:string,game:GameKey,segment:number,delta:number){
  if(!childId) return;
  const ref=makeIdemKey(game,segment);
  await awardPointsWithKey({child_uid:childId,delta,reason:REASONS[game],ref});
}

export function segmentFromCount(count:number,every:number){
  return Math.floor(count/every)-1;
}
