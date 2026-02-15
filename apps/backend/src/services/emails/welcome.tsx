/**
 * Welcome Email Template
 * 
 * Sent immediately after registration.
 * Contains verification link (non-blocking).
 */

import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface WelcomeEmailProps {
  displayName: string;
  verificationUrl: string;
  unsubscribeUrl: string;
  appUrl: string;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  displayName,
  verificationUrl,
  unsubscribeUrl,
  appUrl,
}) => {
  const previewText = `Bienvenue sur WhiteboardAI, ${displayName}!`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Logo */}
          <Section style={logoSection}>
            <Img
              src={`${appUrl}/logo.png`}
              width="48"
              height="48"
              alt="WhiteboardAI"
              style={logo}
            />
          </Section>

          {/* Main Content */}
          <Heading style={heading}>
            Bienvenue sur WhiteboardAI! 🎨
          </Heading>

          <Text style={paragraph}>
            Bonjour <strong>{displayName}</strong>,
          </Text>

          <Text style={paragraph}>
            Merci de rejoindre WhiteboardAI ! Vous pouvez maintenant créer des tableaux 
            interactifs et collaborer avec l'IA pour résoudre des problèmes visuellement.
          </Text>

          <Section style={featuresSection}>
            <Text style={featureTitle}>Ce que vous pouvez faire :</Text>
            <Text style={featureItem}>✨ Créer des tableaux blancs illimités</Text>
            <Text style={featureItem}>🤖 Discuter avec l'IA sur vos dessins</Text>
            <Text style={featureItem}>📸 Capturer et analyser vos schémas</Text>
            <Text style={featureItem}>🎓 Apprendre avec un tuteur IA interactif</Text>
          </Section>

          {/* CTA Button */}
          <Section style={buttonSection}>
            <Button style={button} href={appUrl}>
              Commencer à créer
            </Button>
          </Section>

          <Hr style={hr} />


          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              WhiteboardAI - Votre tableau blanc intelligent
            </Text>
            <Text style={footerLinks}>
              <Link href={appUrl} style={link}>Site web</Link>
              {' • '}
              <Link href={`${appUrl}/help`} style={link}>Aide</Link>
            </Text>
            <Text style={unsubscribeText}>
              <Link href={unsubscribeUrl} style={unsubscribeLink}>
                Se désabonner des emails marketing
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
  borderRadius: '8px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
};

const logoSection = {
  padding: '32px 20px 16px',
  textAlign: 'center' as const,
};

const logo = {
  margin: '0 auto',
};

const heading = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: '600',
  textAlign: 'center' as const,
  padding: '0 20px',
  margin: '0 0 16px',
};

const paragraph = {
  color: '#444444',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 40px',
  margin: '0 0 16px',
};

const featuresSection = {
  backgroundColor: '#f8fafc',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '20px',
};

const featureTitle = {
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const featureItem = {
  color: '#555555',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0',
};

const buttonSection = {
  padding: '16px 40px',
  textAlign: 'center' as const,
};

const button = {
  backgroundColor: '#4f46e5',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const secondaryButton = {
  backgroundColor: '#e0e7ff',
  borderRadius: '6px',
  color: '#4f46e5',
  fontSize: '14px',
  fontWeight: '500',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '10px 20px',
  marginTop: '12px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 40px',
};

const verificationSection = {
  padding: '0 40px',
  textAlign: 'center' as const,
};

const verificationText = {
  color: '#1a1a1a',
  fontSize: '16px',
  margin: '0 0 8px',
};

const smallText = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
};

const footer = {
  padding: '0 40px',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#666666',
  fontSize: '12px',
  margin: '0 0 8px',
};

const footerLinks = {
  color: '#666666',
  fontSize: '12px',
  margin: '0 0 16px',
};

const link = {
  color: '#4f46e5',
  textDecoration: 'none',
};

const unsubscribeText = {
  margin: '0',
};

const unsubscribeLink = {
  color: '#999999',
  fontSize: '11px',
  textDecoration: 'underline',
};

export default WelcomeEmail;
