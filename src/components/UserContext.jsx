import { createContext, useContext, useState, useMemo, useEffect } from 'react'

export const USERS = {
  admin: [
    { id: 'srushti', name: 'Srushti', role: 'admin', avatar: 'SR',
      locations: ['bangalore', 'hyderabad', 'chennai_1', 'chennai_2'] },
  ],
  users: [
    { id: 'varsha', name: 'Varsha', role: 'user', avatar: 'VA',
      locations: ['bangalore', 'hyderabad'] },
    { id: 'pushpa', name: 'Pushpa', role: 'user', avatar: 'PU',
      locations: ['hyderabad'] },
    { id: 'nitya',  name: 'Nitya',  role: 'user', avatar: 'NI',
      locations: ['bangalore'] },
  ],
}

const DEFAULT_PASSWORDS = {
  srushti: 'srushti123',
  varsha:  'varsha123',
  pushpa:  'pushpa123',
  nitya:   'nitya123',
}

const CAM_NAMES = {
  'CAM-A01':    'Foundation Pit View',
  'CAM-HYD-1':  'Main Gate Entry',
  'CAM-HYD-2':  'Tower A — Ground Floor',
  'CAM-HYD-3':  'Tower A — Level 3',
  'CAM-HYD-4':  'Tower A — Level 6',
  'CAM-HYD-5':  'Tower A — Rooftop',
  'CAM-HYD-6':  'Tower B — Ground Floor',
  'CAM-HYD-7':  'Tower B — Level 3',
  'CAM-HYD-8':  'Tower B — Level 6',
  'CAM-HYD-9':  'Tower B — Rooftop',
  'CAM-HYD-10': 'Crane Zone Alpha',
  'CAM-HYD-11': 'Crane Zone Beta',
  'CAM-HYD-12': 'Concrete Pour Area',
  'CAM-HYD-13': 'Material Storage Yard',
  'CAM-HYD-14': 'Workers Welfare Block',
  'CAM-HYD-15': 'North Perimeter Fence',
  'CAM-HYD-16': 'South Perimeter Fence',
  'CAM-HYD-17': 'Excavation Pit East',
  'CAM-HYD-18': 'Excavation Pit West',
  'CAM-HYD-19': 'Site Office Entrance',
  'CAM-HYD-20': 'Emergency Exit Gate',
  'CAM-CHN-1':  'Block B — Perimeter',
  'CAM-CHN-2':  'Block B — Entry Gate',
}

function withName(cam) {
  return {
    ...cam,
    displayName: CAM_NAMES[cam.id] || cam.id,
    name:        cam.db_id,
  }
}

export const CAMERA_LOCATIONS = [
  {
    id: 'bangalore', label: 'Bangalore', icon: '🏗️',
    cameras: [withName({
      id:      'CAM-A01',
      db_id:   'Pier_Cap_Cam_16389',
      hls_url: '/hls/CAM-A01/stream.m3u8',
      ready:   true,
    })],
  },
  {
    id: 'hyderabad', label: 'Hyderabad', icon: '🏢',
    cameras: Array.from({ length: 20 }, (_, i) => withName({
      id:      `CAM-HYD-${i + 1}`,
      db_id:   'Pier_Cap_Cam_16388',
      hls_url: '/hls/CAM-A02/stream.m3u8',
      ready:   i === 0,
    })),
  },
  {
    id: 'chennai', label: 'Chennai', icon: '🏭',
    subLocations: [
      {
        id: 'chennai_1', label: 'Location 1',
        cameras: [withName({
          id:      'CAM-CHN-1',
          db_id:   'Pier_Cap_Cam_16387',
          hls_url: '/hls/CAM-A03/stream.m3u8',
          ready:   true,
        })],
      },
      {
        id: 'chennai_2', label: 'Location 2',
        cameras: [withName({
          id:      'CAM-CHN-2',
          db_id:   'Pier_Cap_Cam_16386',
          hls_url: '/hls/CAM-A07/stream.m3u8',
          ready:   false,
        })],
      },
    ],
  },
]

export const ALL_LOCATION_IDS = ['bangalore', 'hyderabad', 'chennai_1', 'chennai_2']

// ── Backend helpers ───────────────────────────────────────────────────────────
function mergeList(defaults, saved) {
  const base   = defaults.map(u => { const m = (saved || []).find(s => s.id === u.id); return m ? { ...u, ...m } : u })
  const extras = (saved || []).filter(u => !defaults.find(d => d.id === u.id))
  return [...base, ...extras]
}

async function saveToBackend(users, passwords) {
  try {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin:     users.admin.map(u => ({ id: u.id, name: u.name, role: u.role, avatar: u.avatar, locations: u.locations })),
        users:     users.users.map(u => ({ id: u.id, name: u.name, role: u.role, avatar: u.avatar, locations: u.locations })),
        passwords,
      }),
    })
  } catch (err) {
    console.error('Failed to save users to backend:', err)
  }
}
// ─────────────────────────────────────────────────────────────────────────────

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [currentUserId, setCurrentUserId] = useState(null)
  const [users, setUsers] = useState(USERS)
  const [passwords, setPasswords] = useState(DEFAULT_PASSWORDS)

  // Load from backend on mount
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setUsers({
          admin: mergeList(USERS.admin, data.admin || []),
          users: mergeList(USERS.users, data.users || []),
        })
        if (data.passwords) {
          setPasswords(prev => ({ ...prev, ...data.passwords }))
        }
      })
      .catch(() => {})
  }, [])

  const allUsers    = [...users.admin, ...users.users]
  const currentUser = currentUserId ? allUsers.find(u => u.id === currentUserId) ?? null : null
  const isAdmin     = currentUser?.role === 'admin'
  const isLoggedIn  = currentUser !== null

  const visibleLocations = useMemo(() => {
    if (!currentUser) return []
    const liveUser = allUsers.find(u => u.id === currentUser.id)
    if (!liveUser) return []
    return CAMERA_LOCATIONS
      .filter(loc => {
        if (loc.subLocations)
          return loc.subLocations.some(sub => liveUser.locations.includes(sub.id))
        return liveUser.locations.includes(loc.id)
      })
      .map(loc => {
        if (loc.subLocations) {
          return {
            ...loc,
            subLocations: loc.subLocations.filter(sub =>
              liveUser.locations.includes(sub.id)
            ),
          }
        }
        return loc
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, users])

  const login = (user) => setCurrentUserId(user.id)
  const logout = () => setCurrentUserId(null)
  const setCurrentUser = (user) => setCurrentUserId(user.id)

  const toggleUserLocation = (userId, locationId) => {
    if (!isAdmin) return
    setUsers(prev => {
      const update = list => list.map(u => {
        if (u.id !== userId) return u
        const has = u.locations.includes(locationId)
        return {
          ...u,
          locations: has
            ? u.locations.filter(l => l !== locationId)
            : [...u.locations, locationId],
        }
      })
      const next = { admin: update(prev.admin), users: update(prev.users) }
      saveToBackend(next, passwords)
      return next
    })
  }

  const deleteUser = (userId) => {
    if (!isAdmin) return
    setUsers(prev => {
      const next = {
        admin: prev.admin.filter(u => u.id !== userId),
        users: prev.users.filter(u => u.id !== userId),
      }
      const nextPasswords = { ...passwords }
      delete nextPasswords[userId]
      saveToBackend(next, nextPasswords)
      return next
    })
    setPasswords(prev => {
      const next = { ...prev }
      delete next[userId]
      return next
    })
  }

  const addUser = (newUser, password) => {
    if (!isAdmin) return
    setUsers(prev => {
      const next = {
        admin: newUser.role === 'admin' ? [...prev.admin, newUser] : prev.admin,
        users: newUser.role === 'user'  ? [...prev.users, newUser] : prev.users,
      }
      const nextPasswords = { ...passwords, [newUser.id]: password }
      saveToBackend(next, nextPasswords)
      return next
    })
    setPasswords(prev => ({ ...prev, [newUser.id]: password }))
  }

  return (
    <UserContext.Provider value={{
      currentUser,
      isLoggedIn,
      isAdmin,
      visibleLocations,
      users,
      passwords,
      login,
      logout,
      setCurrentUser,
      toggleUserLocation,
      deleteUser,
      addUser,
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}