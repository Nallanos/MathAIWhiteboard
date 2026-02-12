/**
 * Retention Digest Email Template
 * 
 * Sent to re-engage inactive users.
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

interface RetentionDigestEmailProps {
  displayName: string;
  boardCount: number;
  lastBoardTitle?: string;
  daysInactive: number;
  unsubscribeUrl: string;
  appUrl: string;
}

export const RetentionDigestEmail: React.FC<RetentionDigestEmailProps> = ({
  displayName,
  boardCount,
  lastBoardTitle,
  daysInactive,
  unsubscribeUrl,
  appUrl,
}) => {
  const previewText = `${displayName}, vos tableaux vous attendent!`;

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
            On vous a manqué! 👋
          </Heading>

          <Text style={paragraph}>
            Bonjour <strong>{displayName}</strong>,
          </Text>

          <Text style={paragraph}>
            Cela fait <strong>{daysInactive} jours</strong> que nous n'avons pas 
            eu de vos nouvelles sur WhiteboardAI. Vos idées nous manquent !
          </Text>

          {/* Stats Section */}
          <Section style={statsSection}>
            <Text style={statsTitle}>📊 Votre activité</Text>
            
            <Section style={statRow}>
              <Text style={statLabel}>Tableaux créés</Text>
              <Text style={statValue}>{boardCount}</Text>
            </Section>

            {lastBoardTitle && (
              <Section style={statRow}>
                <Text style={statLabel}>Dernier tableau</Text>
                <Text style={statValueSmall}>{lastBoardTitle}</Text>
              </Section>
            )}
          </Section>

          {/* Ideas Section */}
          <Section style={ideasSection}>
            <Text style={ideasTitle}>💡 Que faire aujourd'hui ?</Text>
            <Text style={ideaItem}>• Continuez votre dernier projet</Text>
            <Text style={ideaItem}>• Explorez de nouvelles façons d'utiliser l'IA</Text>
            <Text style={ideaItem}>• Partagez un tableau avec un collègue</Text>
          </Section>

          {/* CTA Button */}
          <Section style={buttonSection}>
            <Button style={button} href={appUrl}>
              Reprendre où j'en étais
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
              Vous ne souhaitez plus recevoir ces emails ?{' '}
              <Link href={unsubscribeUrl} style={unsubscribeLink}>
                Se désabonner
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

const statsSection = {
  backgroundColor: '#f0f9ff',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '20px',
};

const statsTitle = {
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 16px',
};

const statRow = {
  marginBottom: '12px',
};

const statLabel = {
  color: '#666666',
  fontSize: '13px',
  margin: '0',
};

const statValue = {
  color: '#4f46e5',
  fontSize: '24px',
  fontWeight: '700',
  margin: '4px 0 0',
};

const statValueSmall = {
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: '500',
  margin: '4px 0 0',
};

const ideasSection = {
  backgroundColor: '#fef3c7',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '20px',
};

const ideasTitle = {
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 12px',
};

const ideaItem = {
  color: '#555555',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0',
};

const buttonSection = {
  padding: '24px 40px',
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
  padding: '14px 32px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 40px',
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
  color: '#999999',
  fontSize: '11px',
  margin: '0',
};

const unsubscribeLink = {
  color: '#999999',
  textDecoration: 'underline',
};

export default RetentionDigestEmail;
