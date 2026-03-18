"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";

type ProfileForm = {
  business_name: string;
  phone: string;
  email: string;
  address: string;
  postal: string;
  tps: string;
  tvq: string;
  logo_url: string;
  signature_url: string;
};

export default function ProfilePage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  const [profile, setProfile] = useState<ProfileForm>({
    business_name: "",
    phone: "",
    email: "",
    address: "",
    postal: "",
    tps: "",
    tvq: "",
    logo_url: "",
    signature_url: "",
  });

  const [accountEmail, setAccountEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/");
        return;
      }

      setSession(session);
      setAccountEmail(session.user.email || "");

      const { data, error } = await supabase
        .from("entrepreneur_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error(error);
      }

      if (data) {
        setProfile({
          business_name: data.business_name || "",
          phone: data.phone || "",
          email: data.email || session.user.email || "",
          address: data.address || "",
          postal: data.postal || "",
          tps: data.tps || "",
          tvq: data.tvq || "",
          logo_url: data.logo_url || "",
          signature_url: data.signature_url || "",
        });
      } else {
        setProfile((prev) => ({
          ...prev,
          email: session.user.email || "",
        }));
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  async function uploadFile(file: File, type: "logo" | "signature") {
    if (!session?.user?.id) {
      alert("Session introuvable.");
      return;
    }

    try {
      if (type === "logo") setUploadingLogo(true);
      if (type === "signature") setUploadingSignature(true);

      const fileExt = file.name.split(".").pop() || "png";
      const filePath = `${session.user.id}/${type}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        alert(uploadError.message);
        return;
      }

      const { data } = supabase.storage.from("assets").getPublicUrl(filePath);

      if (type === "logo") {
        setProfile((prev) => ({ ...prev, logo_url: data.publicUrl }));
      }

      if (type === "signature") {
        setProfile((prev) => ({ ...prev, signature_url: data.publicUrl }));
      }
    } finally {
      if (type === "logo") setUploadingLogo(false);
      if (type === "signature") setUploadingSignature(false);
    }
  }

  async function saveBusinessProfile() {
    if (!session?.user?.id) {
      alert("Session introuvable.");
      return;
    }

    try {
      setSavingBusiness(true);

      const { error } = await supabase.from("entrepreneur_profiles").upsert(
        {
          user_id: session.user.id,
          business_name: profile.business_name,
          phone: profile.phone,
          email: profile.email,
          address: profile.address,
          postal: profile.postal,
          tps: profile.tps,
          tvq: profile.tvq,
          logo_url: profile.logo_url,
          signature_url: profile.signature_url,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        alert(error.message);
        return;
      }

      alert("Profil entreprise sauvegardé ✅");
    } finally {
      setSavingBusiness(false);
    }
  }

  async function saveAccountSettings() {
    try {
      setSavingAccount(true);

      if (!session) {
        alert("Session introuvable.");
        return;
      }

      if (accountEmail && accountEmail !== session.user.email) {
        const { error } = await supabase.auth.updateUser({
          email: accountEmail,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      if (newPassword || confirmPassword) {
        if (newPassword.length < 6) {
          alert("Le mot de passe doit contenir au moins 6 caractères.");
          return;
        }

        if (newPassword !== confirmPassword) {
          alert("Les mots de passe ne correspondent pas.");
          return;
        }

        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          alert(error.message);
          return;
        }
      }

      alert("Compte mis à jour ✅ Vérifie aussi tes emails de confirmation si nécessaire.");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setSavingAccount(false);
    }
  }

  if (loading) {
    return <main style={{ padding: 40, fontFamily: "Arial" }}>Chargement...</main>;
  }

  return (
    <main style={{ padding: 40, fontFamily: "Arial", maxWidth: 1100, margin: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 8 }}>Mon profil</h1>
          <p style={{ marginTop: 0, color: "#555" }}>
            Gère les informations de ton entreprise et les paramètres de ton compte.
          </p>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          ← Dashboard
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 24,
          marginTop: 24,
        }}
      >
        <section
          style={{
            display: "grid",
            gap: 14,
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
          }}
        >
          <h2 style={{ margin: 0 }}>Paramètres du compte</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ display: "grid", gap: 10 }}>
              <label>Email de connexion</label>
              <input
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                style={{ padding: 12 }}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label>Email public affiché sur les factures</label>
              <input
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                style={{ padding: 12 }}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label>Nouveau mot de passe</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ padding: 12 }}
              />
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label>Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ padding: 12 }}
              />
            </div>
          </div>

          <div>
            <button
              onClick={saveAccountSettings}
              disabled={savingAccount}
              style={{
                padding: "12px 18px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "#111827",
                color: "white",
                fontWeight: 700,
              }}
            >
              {savingAccount ? "Sauvegarde..." : "Sauvegarder le compte"}
            </button>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#fff",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <h2 style={{ marginTop: 0 }}>Entreprise</h2>

            <input
              placeholder="Nom de l’entreprise"
              value={profile.business_name}
              onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
              style={{ padding: 12 }}
            />

            <input
              placeholder="Téléphone"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              style={{ padding: 12 }}
            />

            <input
              placeholder="Adresse"
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              style={{ padding: 12 }}
            />

            <input
              placeholder="Code postal"
              value={profile.postal}
              onChange={(e) => setProfile({ ...profile, postal: e.target.value })}
              style={{ padding: 12 }}
            />

            <input
              placeholder="Numéro TPS"
              value={profile.tps}
              onChange={(e) => setProfile({ ...profile, tps: e.target.value })}
              style={{ padding: 12 }}
            />

            <input
              placeholder="Numéro TVQ"
              value={profile.tvq}
              onChange={(e) => setProfile({ ...profile, tvq: e.target.value })}
              style={{ padding: 12 }}
            />
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <h2 style={{ marginTop: 0 }}>Branding</h2>

            <label>Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file, "logo");
              }}
            />
            {uploadingLogo ? <div>Upload du logo...</div> : null}
            {profile.logo_url ? (
              <img
                src={profile.logo_url}
                alt="Logo"
                style={{
                  width: 160,
                  maxHeight: 140,
                  objectFit: "contain",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 8,
                  background: "#fff",
                }}
              />
            ) : (
              <div style={{ color: "#777" }}>Aucun logo téléchargé</div>
            )}

            <label style={{ marginTop: 12 }}>Signature</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file, "signature");
              }}
            />
            {uploadingSignature ? <div>Upload de la signature...</div> : null}
            {profile.signature_url ? (
              <img
                src={profile.signature_url}
                alt="Signature"
                style={{
                  width: 200,
                  maxHeight: 100,
                  objectFit: "contain",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 8,
                  background: "#fff",
                }}
              />
            ) : (
              <div style={{ color: "#777" }}>Aucune signature téléchargée</div>
            )}
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <button
              onClick={saveBusinessProfile}
              disabled={savingBusiness}
              style={{
                padding: "12px 18px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                background: "#4f46e5",
                color: "white",
                fontWeight: 700,
              }}
            >
              {savingBusiness ? "Sauvegarde..." : "Sauvegarder le profil entreprise"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}