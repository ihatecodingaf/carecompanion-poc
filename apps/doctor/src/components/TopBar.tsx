import { useStore } from '../store/useStore';

export default function TopBar() {
  const { doctor, logout } = useStore();

  const initials = doctor?.name
    ? doctor.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'DR';

  function handleLogout() {
    logout();
  }

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between px-3.5"
      style={{
        height: '48px',
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--b)',
      }}
    >
      {/* Logo + name */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col leading-none">
          <span className="text-[0.8rem] font-extrabold tracking-widest" style={{ color: 'var(--t)' }}>
            PRECOVERY
          </span>
          <span className="text-[0.46rem] font-medium tracking-wide mt-0.5" style={{ color: 'var(--teal)' }}>
            AI Care Companion
          </span>
        </div>
      </div>

      {/* Doctor chip */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleLogout}
          className="text-[0.58rem] font-semibold px-2 py-1 rounded-full"
          style={{ background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t2)' }}
        >
          Sign out
        </button>
        <div
          className="flex items-center gap-1.5 rounded-full px-2 py-1"
          style={{ background: 'var(--bg3)', border: '1px solid var(--b)' }}
        >
          <div
            className="w-[21px] h-[21px] rounded-full flex items-center justify-center
                       text-[0.48rem] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--teal), #1A8A8A)' }}
          >
            {initials}
          </div>
          <span className="text-[0.62rem] font-semibold" style={{ color: 'var(--t)' }}>
            {doctor ? doctor.name.replace('Dr. ', 'Dr.') : 'Doctor'}
          </span>
        </div>
      </div>
    </header>
  );
}
