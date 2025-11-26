// src/components/PointsChips.tsx
type Props = { available: number; balance: number; reserved: number; onRefresh?: () => void };

export default function PointsChips({ available, balance, reserved, onRefresh }: Props) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="glass rounded-xl px-4 py-2">
        <span className="text-white/60 mr-2">Available:</span>
        <span className="font-black text-emerald-300 text-2xl drop-shadow">{available}</span>
      </div>
      <div className="glass rounded-xl px-4 py-2">
        <span className="text-white/60 mr-2">Balance:</span>
        <span className="font-semibold text-white/90 text-xl drop-shadow">{balance}</span>
      </div>
      <div className="glass rounded-xl px-4 py-2">
        <span className="text-white/60 mr-2">Reserved:</span>
        <span className="font-semibold text-yellow-300 text-xl drop-shadow">-{reserved}</span>
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm"
          title="Force refresh"
        >
          Refresh
        </button>
      )}
    </div>
  );
}
