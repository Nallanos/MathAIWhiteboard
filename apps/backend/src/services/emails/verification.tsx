/**
 * Verification Email Template
 * 
 * Sent when user requests email verification resend.
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

interface VerificationEmailProps {
  displayName: string;
  verificationUrl: string;
  appUrl: string;
}

export const VerificationEmail: React.FC<VerificationEmailProps> = ({
  displayName,
  verificationUrl,
  appUrl,
}) => {
  const previewText = 'Vérifiez votre adresse email - WhiteboardAI';

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
            Vérifiez votre email 📧
          </Heading>

          <Text style={paragraph}>
            Bonjour <strong>{displayName}</strong>,
          </Text>

          <Text style={paragraph}>
            Cliquez sur le bouton ci-dessous pour vérifier votre adresse email 
            et sécuriser votre compte WhiteboardAI.
          </Text>

          {/* CTA Button */}
          <Section style={buttonSection}>
            <Button style={button} href={verificationUrl}>
              Vérifier mon email
            </Button>
          </Section>

          <Text style={smallText}>
            Ce lien expire dans 24 heures. Si vous n'avez pas demandé cette 
            vérification, vous pouvez ignorer cet email.
          </Text>

          <Hr style={hr} />

          {/* Alternative Link */}
          <Section style={altLinkSection}>
            <Text style={altLinkText}>
              Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :
            </Text>
            <Text style={linkText}>
              <Link href={verificationUrl} style={link}>
                {verificationUrl}
              </Link>
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              WhiteboardAI - Votre tableau blanc intelligent
            </Text>
            <Text style={footerLinks}>
              <Link href={appUrl} style={footerLink}>Site web</Link>
              {' • '}
              <Link href={`${appUrl}/help`} style={footerLink}>Aide</Link>
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

const smallText = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '22px',
  padding: '0 40px',
  textAlign: 'center' as const,
  margin: '0',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '32px 40px',
};

const altLinkSection = {
  padding: '0 40px',
};

const altLinkText = {
  color: '#666666',
  fontSize: '13px',
  margin: '0 0 8px',
};

const linkText = {
  margin: '0',
  wordBreak: 'break-all' as const,
};

const link = {
  color: '#4f46e5',
  fontSize: '13px',
  textDecoration: 'none',
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
  margin: '0',
};

const footerLink = {
  color: '#4f46e5',
  textDecoration: 'none',
};

export default VerificationEmail;
