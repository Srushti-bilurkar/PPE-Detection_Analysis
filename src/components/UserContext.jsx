import { createContext, useContext, useState } from 'react'

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

// ── withName: sets displayName for UI and name = db_id for MongoDB/API calls ──
// ✅ Fix — name = MongoDB key, displayName = UI label
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
      hls_url: '/hls/CAM-A01/stream.m3u8',   // ← keep as CAM-A01
      ready:   false,
    })],
  },
  {
    id: 'hyderabad', label: 'Hyderabad', icon: '🏢',
    cameras: Array.from({ length: 20 }, (_, i) => withName({
      id:      `CAM-HYD-${i + 1}`,
      db_id:   'Pier_Cap_Cam_16388',
      hls_url: '/hls/CAM-A02/stream.m3u8',   // ← keep as CAM-A02
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
          hls_url: '/hls/CAM-A03/stream.m3u8',  // ← keep as CAM-A03
          ready:   true,
        })],
      },
      {
        id: 'chennai_2', label: 'Location 2',
        cameras: [withName({
          id:      'CAM-CHN-2',
          db_id:   'Pier_Cap_Cam_16386',
          hls_url: '/hls/CAM-A07/stream.m3u8',  // ← keep as CAM-A07
          ready:   false,
        })],
      },
    ],
  },
]
export const ALL_LOCATION_IDS = ['bangalore', 'hyderabad', 'chennai_1', 'chennai_2']

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [currentUserId, setCurrentUserId] = useState('srushti')
  const [users, setUsers] = useState(USERS)

  const allUsers    = [...users.admin, ...users.users]
  const currentUser = allUsers.find(u => u.id === currentUserId) || users.admin[0]
  const isAdmin     = currentUser.role === 'admin'

  const visibleLocations = CAMERA_LOCATIONS.filter(loc => {
    if (loc.subLocations) return loc.subLocations.some(sub => currentUser.locations.includes(sub.id))
    return currentUser.locations.includes(loc.id)
  }).map(loc => {
    if (loc.subLocations) {
      return { ...loc, subLocations: loc.subLocations.filter(sub => currentUser.locations.includes(sub.id)) }
    }
    return loc
  })

  const toggleUserLocation = (userId, locationId) => {
    if (!isAdmin) return
    setUsers(prev => {
      const update = list => list.map(u => {
        if (u.id !== userId) return u
        const has = u.locations.includes(locationId)
        return { ...u, locations: has ? u.locations.filter(l => l !== locationId) : [...u.locations, locationId] }
      })
      return { admin: update(prev.admin), users: update(prev.users) }
    })
  }

  return (
    <UserContext.Provider value={{
      currentUser,
      setCurrentUser: (user) => setCurrentUserId(user.id),
      isAdmin,
      visibleLocations,
      users,
      toggleUserLocation,
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}