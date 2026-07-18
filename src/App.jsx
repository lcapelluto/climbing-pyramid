import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import Auth from "./components/Auth";
import PyramidTracker from "./components/PyramidTracker";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = logged out

  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  if (user === undefined) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8478" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {user ? <PyramidTracker uid={user.uid} /> : <Auth />}
    </div>
  );
}
