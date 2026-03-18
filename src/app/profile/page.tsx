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
  const [saving, setSaving] = useState(false);
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
        .upload(filePath, file, {
          upsert: true,
        });

      if (uploadError) {
        alert(uploadError.message);
        return;
      }

      const { data } = supabase.storage.from("assets").getPublicUrl(filePath);

      if (type === "logo") {
        setProfile((prev) => ({
          ...prev,
          logo_url: data.publicUrl,
        }));
      }

      if (type === "signature") {
        setProfile((prev) => ({
          ...prev,
          signature_url: data.publicUrl,
        }));
      }
    } finally {
      if (type === "logo") setUploadingLogo(false);
      if (type === "signature") setUploadingSignature(false);
    }
  }

  async function saveProfile() {
    if (!session?.user?.id) {
      alert("Session introuvable.");
      return;
    }

    try {
      setSaving(true);

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
        {
          onConflict: "user_id",
        }
      );

      if (error) {
        alert(error.message);
        return;
      }

      alert("Profil sauvegardé ✅");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main style={{ padding: 40, fontFamily: "Arial" }}>Chargement...</main>;
  }

  return (
    <main style={{ padding: 40, fontFamily: "Arial", maxWidth: 1000, margin: "auto" }}>
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
          <h1 style={{ marginBottom: 8 }}>Profil Entrepreneur</h1>
          <p style={{ marginTop: 0, color: "#555" }}>
            Complète les informations de ton entreprise pour les réutiliser dans les factures.
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
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 20,
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            background: "#fff",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Informations entreprise</h3>

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
            placeholder="Email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
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
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 20,
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            background: "#fff",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Taxes</h3>

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

          <h3 style={{ marginTop: 12 }}>Logo</h3>

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

          <h3 style={{ marginTop: 12 }}>Signature</h3>

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
      </div>

      <div style={{ marginTop: 30 }}>
        <button
          onClick={saveProfile}
          disabled={saving}
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
          {saving ? "Sauvegarde..." : "Sauvegarder le profil"}
        </button>
      </div>
    </main>
  );
}