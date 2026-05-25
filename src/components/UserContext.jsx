import { createContext, useContext, useState } from 'react'

// ── User definitions — each user has their own locations array ────────────────
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

// ── Camera locations — flat list, no adminOnly ────────────────────────────────
export const CAMERA_LOCATIONS = [
  {
    id:      'bangalore',
    label:   'Bangalore',
    icon:    '🏗️',
    cameras: [{ id: 'CAM-A01', hls_url: '/hls/CAM-A01/stream.m3u8', ready: false }],
  },
  {
    id:      'hyderabad',
    label:   'Hyderabad',
    icon:    '🏢',
    cameras: Array.from({ length: 20 }, (_, i) => ({
      id:      `CAM-HYD-${i + 1}`,
      hls_url: '/hls/CAM-A02/stream.m3u8',
      ready:   true,
    })),
  },
  {
    id:    'chennai',
    label: 'Chennai',
    icon:  '🏭',
    subLocations: [
      {
        id:      'chennai_1',
        label:   'Location 1',
        cameras: Array.from({ length: 1 }, (_, i) => ({
          id:      `CAM-HYD-${i + 1}`,
          hls_url: '/hls/CAM-A02/stream.m3u8',
          ready:   true,
        })),
      },
      {
        id:      'chennai_2',
        label:   'Location 2',
        cameras: Array.from({ length: 1 }, (_, i) => ({
          id:      `CAM-CHN-${i + 1}`,
          hls_url: '/hls/CAM-A07/stream.m3u8',
          ready:   false,
        })),
      },
    ],
  },
]

// ── All location IDs (flat) ───────────────────────────────────────────────────
export const ALL_LOCATION_IDS = ['bangalore', 'hyderabad', 'chennai_1', 'chennai_2']

// ── Context ───────────────────────────────────────────────────────────────────
const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [currentUserId, setCurrentUserId] = useState('srushti')
  const [users, setUsers] = useState(USERS)

  // find current user from state
  const allUsers    = [...users.admin, ...users.users]
  const currentUser = allUsers.find(u => u.id === currentUserId) || users.admin[0]
  const isAdmin     = currentUser.role === 'admin'

  // filter CAMERA_LOCATIONS based on current user's locations array
  const visibleLocations = CAMERA_LOCATIONS.filter(loc => {
    if (loc.subLocations) {
      // Chennai shows if user has access to at least one sub-location
      return loc.subLocations.some(sub => currentUser.locations.includes(sub.id))
    }
    return currentUser.locations.includes(loc.id)
  }).map(loc => {
    if (loc.subLocations) {
      // filter sub-locations the user has access to
      return {
        ...loc,
        subLocations: loc.subLocations.filter(sub => currentUser.locations.includes(sub.id)),
      }
    }
    return loc
  })

  // admin can toggle any user's access to any location
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
