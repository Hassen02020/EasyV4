# Guide Configuration Passkeys - TunisiaGo

## Prérequis
- Accès au dashboard Supabase : https://supabase.com/dashboard
- Projet : `gkuxrxyxmwrbkrmtvqbp`

---

## Étape 1 : Activer les Passkeys dans l'Auth

1. Allez sur : https://supabase.com/dashboard/project/gkuxrxyxmwrbkrmtvqbp/auth/providers
2. Descendez jusqu'à la section **"Passkeys (WebAuthn)"**
3. Activez le toggle **"Enable Passkeys"**

---

## Étape 2 : Configurer le Relying Party (RP)

Dans la même section, configurez :

| Champ | Valeur Développement | Valeur Production |
|-------|---------------------|-------------------|
| **RP ID** | `localhost` | `votre-domaine.com` (sans https) |
| **RP Display Name** | `TunisiaGo Local` | `TunisiaGo` |
| **RP Origins** | `http://localhost:3000` | `https://votre-domaine.com` |

### Pour le développement local :
```
RP ID: localhost
RP Display Name: TunisiaGo
RP Origins: http://localhost:3000,http://192.168.100.33:3000
```

---

## Étape 3 : Vérifier la Configuration

1. Allez dans **Logs** (sidebar gauche)
2. Vérifiez qu'il n'y a pas d'erreurs

---

## Étape 4 : Tester l'Application

1. Redémarrez le serveur local :
   ```bash
   cd C:\Users\user\CascadeProjects\Easy2bookV5
   pnpm dev
   ```

2. Ouvrez http://localhost:3000/login

3. Vous devriez voir le bouton **"Connexion avec Passkey"**

---

## Étape 5 : Premier Enregistrement d'un Passkey

Le flow d'enregistrement nécessite une connexion préalable :

1. **Connectez-vous** avec Email/Password ou Google
2. Une fois connecté, allez dans **Profil** (à créer si pas existant)
3. Cliquez sur **"Ajouter un Passkey"**
4. Suivez les instructions du navigateur (empreinte, Face ID, ou PIN)

### Alternative : Enregistrement automatique

Le code est configuré pour proposer l'enregistrement automatiquement si aucun passkey n'existe :

```typescript
// Dans @/components/passkey-auth.tsx
if (signInError.message.includes("No passkey found")) {
  await onPasskeyRegister() // Propose l'enregistrement
}
```

---

## Compatibilité Navigateurs

| Navigateur | Support | Notes |
|------------|---------|-------|
| Chrome 108+ | ✅ Complet | Windows, macOS, Android |
| Safari 16+ | ✅ Complet | iOS 16+, macOS Ventura+ |
| Edge 108+ | ✅ Complet | Windows |
| Firefox | ⚠️ Partiel | Nécessite flag `security.webauthn.enable_json_serialization` |

---

## Dépannage

### Erreur : "This site cannot use passkeys"
- Vérifiez que l'RP ID correspond bien au domaine
- Pour localhost : utilisez `http://localhost:3000` (pas 127.0.0.1)

### Erreur : "User canceled the operation"
- Normal si l'utilisateur refuse l'authentification biométrique
- Proposez une alternative (email/password)

### Erreur : "No passkey found"
- L'utilisateur doit d'abord enregistrer un passkey
- Connectez-vous d'abord avec email/password

---

## Production

Pour la production, ajoutez votre domaine :

```
RP ID: tunisiago.com
RP Display Name: TunisiaGo
RP Origins: https://tunisiago.com,https://www.tunisiago.com
```

**Important** : L'RP ID doit être un domaine valide (pas d'IP, pas de port).

---

## Sécurité

- Les passkeys sont liés à l'appareil (biométrique ou PIN)
- Impossible de voler ou phisher un passkey
- Résistant aux attaques par replay
- Synchronisés via le cloud du navigateur (Google, Apple, Microsoft)

---

## Références

- Documentation Supabase : https://supabase.com/docs/guides/auth/auth-passkeys
- WebAuthn Spec : https://www.w3.org/TR/webauthn-2/
- Passkeys.dev : https://passkeys.dev/
